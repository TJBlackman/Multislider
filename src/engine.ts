import { EMPTY_METRICS, normalizeOffset, wrapState } from "./measure";
import type { Metrics, WrapState } from "./types";

const MOMENTUM_FRICTION = 0.94;
const MOMENTUM_STOP = 0.02; // px per ms
const MAX_FRAME_DELTA = 100; // ms, ignores long gaps such as a restored tab

export type JobKind = "tween" | "marquee" | "momentum";

type Job =
  | {
      kind: "tween";
      from: number;
      delta: number;
      duration: number;
      startedAt: number;
      done: (() => void) | null;
    }
  | { kind: "marquee"; speed: number; last: number }
  | { kind: "momentum"; velocity: number; last: number; done: (() => void) | null };

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Owns the single scalar offset, the frame loop and every transform write.
 * All geometry is logical: RTL only flips the sign at write time.
 */
export class Engine {
  metrics: Metrics = EMPTY_METRICS;
  offset = 0;
  looping = true;
  rtl: boolean;

  readonly #track: HTMLElement;
  #states: WrapState[] = [];
  #job: Job | null = null;
  #frame = 0;
  #destroyed = false;

  constructor(track: HTMLElement, rtl: boolean) {
    this.#track = track;
    this.rtl = rtl;
  }

  get jobKind(): JobKind | null {
    return this.#job ? this.#job.kind : null;
  }

  setMetrics(metrics: Metrics): void {
    this.metrics = metrics;
    // The caller cleared every slide transform to measure, so the cache starts neutral.
    this.#states = new Array<WrapState>(metrics.slides.length).fill(0);
  }

  setOffset(value: number): void {
    this.offset = this.#clamp(value);
  }

  #clamp(value: number): number {
    const { contentSize, viewportSize } = this.metrics;
    if (!(contentSize > 0)) return 0;
    if (this.looping) return normalizeOffset(value, contentSize);
    const max = Math.max(0, contentSize - viewportSize);
    return Math.min(Math.max(value, 0), max);
  }

  render(): void {
    const { slides, contentSize, viewportSize } = this.metrics;
    const sign = this.rtl ? -1 : 1;
    this.#track.style.transform = `translate3d(${-sign * this.offset}px, 0, 0)`;

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      if (!slide) continue;
      const state: WrapState = this.looping
        ? wrapState(slide.start, slide.size, this.offset, contentSize, viewportSize)
        : 0;
      if (this.#states[i] === state) continue;
      this.#states[i] = state;
      slide.el.style.transform =
        state === 0 ? "" : `translateX(${sign * state * contentSize}px)`;
    }
  }

  clearSlideTransforms(): void {
    for (const slide of this.metrics.slides) slide.el.style.transform = "";
    this.#states = new Array<WrapState>(this.metrics.slides.length).fill(0);
  }

  tween(delta: number, duration: number, done?: () => void): void {
    this.cancel();
    if (duration <= 0 || delta === 0) {
      this.setOffset(this.offset + delta);
      this.render();
      done?.();
      return;
    }
    this.#job = {
      kind: "tween",
      from: this.offset,
      delta,
      duration,
      startedAt: -1,
      done: done ?? null,
    };
    this.#schedule();
  }

  /**
   * Complete an in-flight tween's offset without rendering or firing its
   * callback. Returns the pending callback so callers can defer it past a
   * remeasure. Callers must render.
   */
  settleTween(): (() => void) | null {
    const job = this.#job;
    if (!job || job.kind !== "tween") return null;
    this.cancel();
    this.setOffset(job.from + job.delta);
    return job.done;
  }

  /** Jump an in-flight tween to its end so a new step can start from a settled offset. */
  finishTween(): void {
    if (this.jobKind !== "tween") return;
    const done = this.settleTween();
    this.render();
    done?.();
  }

  startMarquee(speed: number): void {
    this.cancel();
    if (speed <= 0 || !this.looping || !(this.metrics.contentSize > 0)) return;
    this.#job = { kind: "marquee", speed, last: -1 };
    this.#schedule();
  }

  startMomentum(velocity: number, done?: () => void): void {
    this.cancel();
    if (Math.abs(velocity) < MOMENTUM_STOP) {
      done?.();
      return;
    }
    this.#job = { kind: "momentum", velocity, last: -1, done: done ?? null };
    this.#schedule();
  }

  /**
   * Drops any pending done callback by design; interrupting flows own
   * re-establishing the event and autoplay state (steps self-realign to
   * boundaries, so a dropped snap callback is harmless).
   */
  cancel(): void {
    this.#job = null;
    if (this.#frame !== 0) {
      cancelAnimationFrame(this.#frame);
      this.#frame = 0;
    }
  }

  destroy(): void {
    this.cancel();
    this.#destroyed = true;
  }

  #schedule(): void {
    if (this.#destroyed || this.#frame !== 0 || !this.#job) return;
    this.#frame = requestAnimationFrame(this.#onFrame);
  }

  #onFrame = (now: number): void => {
    this.#frame = 0;
    const job = this.#job;
    if (!job || this.#destroyed) return;

    if (job.kind === "tween") {
      if (job.startedAt < 0) job.startedAt = now;
      const t = Math.min(1, (now - job.startedAt) / job.duration);
      this.setOffset(job.from + job.delta * easeInOutCubic(t));
      this.render();
      if (t >= 1) {
        this.#job = null;
        job.done?.();
        return;
      }
    } else if (job.kind === "marquee") {
      if (job.last < 0) job.last = now;
      const dt = Math.min(now - job.last, MAX_FRAME_DELTA);
      job.last = now;
      this.setOffset(this.offset + (job.speed * dt) / 1000);
      this.render();
    } else {
      if (job.last < 0) job.last = now;
      const dt = Math.min(now - job.last, MAX_FRAME_DELTA);
      job.last = now;
      this.setOffset(this.offset + job.velocity * dt);
      this.render();
      // Pinned against a clamped edge with outward velocity: finish now
      // instead of waiting ~1s for friction to decay a velocity going nowhere.
      if (!this.looping) {
        const max = Math.max(0, this.metrics.contentSize - this.metrics.viewportSize);
        if (
          (this.offset <= 0 && job.velocity < 0) ||
          (this.offset >= max && job.velocity > 0)
        ) {
          this.#job = null;
          job.done?.();
          return;
        }
      }
      job.velocity *= Math.pow(MOMENTUM_FRICTION, dt / 16.6667);
      if (Math.abs(job.velocity) < MOMENTUM_STOP) {
        this.#job = null;
        job.done?.();
        return;
      }
    }

    this.#schedule();
  };
}
