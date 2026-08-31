import { Engine } from "./engine";
import {
  buildMetrics,
  deltaToBoundary,
  headAt,
  modIndex,
  normalizeOffset,
  normalizeOptions,
  offsetForHead,
  pageRun,
  readBox,
  readGap,
  runDistance,
  wrappedPosition,
} from "./measure";
import type {
  BoxGeometry,
  ChangeDetail,
  Metrics,
  Mode,
  MultisliderOptions,
  PauseDetail,
  PauseReason,
  ResolvedOptions,
} from "./types";

const VIEWPORT_SELECTOR = '[data-ms="viewport"], .ms-viewport, .MS-content';
const PREV_SELECTOR = '[data-ms="prev"], .MS-left';
const NEXT_SELECTOR = '[data-ms="next"], .MS-right';
const TRACK_CLASS = "ms-track";
const CLONE_ATTR = "data-ms-clone";
const DRAG_THRESHOLD = 4; // px before a pointer gesture counts as a drag
const CLICK_BLOCK_MS = 300;
const MAX_SLIDE_ELEMENTS = 600; // cap on originals plus clones across all sets
const MAX_GUARD_PASSES = 3;
const GUARD_EPS = 0.5; // px: loop guard tolerance, edge detection, progress check

const instances = new WeakMap<HTMLElement, Multislider>();

type Teardown = () => void;

interface DragState {
  pointerId: number;
  startX: number;
  startOffset: number;
  lastX: number;
  lastTime: number;
  velocity: number;
  moved: boolean;
}

export class Multislider {
  readonly #root: HTMLElement;
  readonly #viewport: HTMLElement;
  readonly #track: HTMLElement;
  readonly #engine: Engine;
  readonly #options: ResolvedOptions;
  readonly #rtl: boolean;

  readonly #originalNodes: ChildNode[];
  readonly #originalSlides: HTMLElement[];
  readonly #slideStyles = new Map<HTMLElement, string | null>();
  readonly #viewportStyle: string | null;
  readonly #addedAttributes: Array<[Element, string]> = [];
  readonly #teardown: Teardown[] = [];

  #duplicates: HTMLElement[] = [];
  #prevButton: HTMLElement | null = null;
  #nextButton: HTMLElement | null = null;

  #mode: Mode;
  /** Last good head; index is logical (mod originals) so clone count changes cannot shift it. */
  #head = { index: 0, fraction: 0 };
  #reasons = new Set<PauseReason>();
  #reducedMotion = false;
  #looping = true;
  #warnedNoLoop = false;
  #destroyed = false;

  #timer: ReturnType<typeof setInterval> | null = null;
  #resizeFrame = 0;
  #observer: ResizeObserver | null = null;
  #drag: DragState | null = null;
  #clickBlocker: ((event: Event) => void) | null = null;
  #clickBlockTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(target: string | HTMLElement, options: MultisliderOptions = {}) {
    const root =
      typeof target === "string"
        ? document.querySelector<HTMLElement>(target)
        : target;
    if (!root) {
      throw new Error(`Multislider: no element matched "${String(target)}".`);
    }
    if (instances.has(root)) {
      throw new Error(
        "Multislider: this element is already initialized. Call destroy() first."
      );
    }
    const viewport = root.querySelector<HTMLElement>(VIEWPORT_SELECTOR);
    if (!viewport) {
      throw new Error(
        'Multislider: no viewport found. Add [data-ms="viewport"], .ms-viewport or .MS-content inside the root element.'
      );
    }

    this.#root = root;
    this.#viewport = viewport;
    this.#options = normalizeOptions(options);
    this.#mode = this.#options.mode;
    this.#rtl = resolveRtl(root, this.#options.direction);

    this.#originalNodes = Array.from(viewport.childNodes);
    this.#viewportStyle = viewport.getAttribute("style");

    this.#track = viewport.ownerDocument.createElement("div");
    this.#track.className = TRACK_CLASS;
    for (const node of this.#originalNodes) this.#track.appendChild(node);
    viewport.appendChild(this.#track);

    this.#originalSlides = Array.from(this.#track.children).filter(
      isHtmlElement
    );
    for (const slide of this.#originalSlides) {
      this.#slideStyles.set(slide, slide.getAttribute("style"));
    }

    this.#applyStructuralStyles();
    this.#applyAccessibility();

    this.#engine = new Engine(this.#track, this.#rtl);
    this.#measure();

    this.#wireButtons();
    this.#wirePointer();
    this.#wireFocusAndKeys();
    this.#wireVisibility();
    this.#wireResize();
    this.#wireMediaQueries();
    this.#wireReducedMotion();

    instances.set(root, this);
    this.#syncLoop();
  }

  static get(element: HTMLElement): Multislider | undefined {
    return instances.get(element);
  }

  get element(): HTMLElement {
    return this.#root;
  }

  get paused(): boolean {
    return this.#reasons.size > 0;
  }

  next(count = 1): void {
    this.#step(1, normalizeCount(count));
  }

  prev(count = 1): void {
    this.#step(-1, normalizeCount(count));
  }

  nextPage(): void {
    this.#step(1, this.#pageCount(1));
  }

  prevPage(): void {
    this.#step(-1, this.#pageCount(-1));
  }

  pause(): void {
    this.#addReason("api");
  }

  play(): void {
    this.#removeReason("api");
  }

  refresh(): void {
    if (this.#destroyed) return;
    this.#measure();
    this.#syncLoop();
  }

  setMode(mode: Mode): void {
    if (this.#destroyed) return;
    const next: Mode = mode === "marquee" ? "marquee" : "step";
    if (next === this.#mode) return;
    this.#engine.cancel();
    this.#mode = next;
    this.#stopAutoplay();
    this.#syncLoop();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;

    this.#stopAutoplay();
    this.#unblockClick();
    this.#engine.destroy();
    this.#observer?.disconnect();
    this.#observer = null;
    if (this.#resizeFrame !== 0) {
      cancelAnimationFrame(this.#resizeFrame);
      this.#resizeFrame = 0;
    }
    for (const off of this.#teardown.splice(0)) off();

    this.#removeDuplicates();

    for (const [slide, style] of this.#slideStyles) {
      if (style === null) slide.removeAttribute("style");
      else slide.setAttribute("style", style);
    }

    this.#track.remove();
    for (const node of this.#originalNodes) this.#viewport.appendChild(node);

    if (this.#viewportStyle === null) this.#viewport.removeAttribute("style");
    else this.#viewport.setAttribute("style", this.#viewportStyle);

    for (const [element, name] of this.#addedAttributes.splice(0)) {
      element.removeAttribute(name);
    }

    instances.delete(this.#root);
  }

  // ---------------------------------------------------------------- setup

  #applyStructuralStyles(): void {
    this.#viewport.style.overflow = "hidden";
    this.#track.style.display = "flex";
    this.#track.style.width = "100%";
    this.#track.style.willChange = "transform";
    if (this.#options.draggable) this.#track.style.touchAction = "pan-y";
  }

  #applySlideStyles(slides: readonly HTMLElement[]): void {
    for (const slide of slides) slide.style.flex = "0 0 auto";
  }

  #applyAccessibility(): void {
    this.#setAttribute(this.#root, "aria-roledescription", "carousel");
    this.#setAttribute(this.#root, "role", "region");
    if (
      !this.#root.hasAttribute("aria-label") &&
      !this.#root.hasAttribute("aria-labelledby")
    ) {
      this.#setAttribute(this.#root, "aria-label", "slideshow");
    }
    const total = this.#originalSlides.length;
    for (let i = 0; i < total; i++) {
      const slide = this.#originalSlides[i];
      if (!slide) continue;
      this.#setAttribute(slide, "role", "group");
      this.#setAttribute(slide, "aria-roledescription", "slide");
      if (
        !slide.hasAttribute("aria-label") &&
        !slide.hasAttribute("aria-labelledby")
      ) {
        this.#setAttribute(slide, "aria-label", `${i + 1} of ${total}`);
      }
    }
  }

  /** Per the APG carousel pattern: announce changes only while not rotating. */
  #syncLiveRegion(): void {
    const rotating =
      this.#reasons.size === 0 &&
      (this.#mode === "marquee" || this.#options.interval > 0);
    this.#track.setAttribute("aria-live", rotating ? "off" : "polite");
  }

  #setAttribute(element: Element, name: string, value: string): void {
    if (element.hasAttribute(name)) return;
    element.setAttribute(name, value);
    this.#addedAttributes.push([element, name]);
  }

  #labelButton(button: HTMLElement, label: string): void {
    const named =
      button.hasAttribute("aria-label") ||
      button.hasAttribute("aria-labelledby") ||
      button.hasAttribute("title") ||
      (button.textContent ?? "").trim() !== "";
    if (named) return;
    this.#setAttribute(button, "aria-label", label);
  }

  #on(
    target: EventTarget,
    type: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ): void {
    target.addEventListener(type, handler, options);
    this.#teardown.push(() =>
      target.removeEventListener(type, handler, options)
    );
  }

  #wireButtons(): void {
    this.#prevButton = this.#root.querySelector<HTMLElement>(PREV_SELECTOR);
    this.#nextButton = this.#root.querySelector<HTMLElement>(NEXT_SELECTOR);
    if (this.#prevButton) {
      this.#labelButton(this.#prevButton, "Previous slide");
      this.#on(this.#prevButton, "click", () => this.#advance(-1));
    }
    if (this.#nextButton) {
      this.#labelButton(this.#nextButton, "Next slide");
      this.#on(this.#nextButton, "click", () => this.#advance(1));
    }
  }

  #wirePointer(): void {
    if (this.#options.hoverPause) {
      this.#on(this.#viewport, "pointerenter", () => this.#addReason("hover"));
      this.#on(this.#viewport, "pointerleave", () => this.#removeReason("hover"));
    }
    if (!this.#options.draggable) return;

    this.#on(this.#track, "pointerdown", this.#onPointerDown as EventListener);
    const view = this.#root.ownerDocument.defaultView ?? window;
    this.#on(view, "pointermove", this.#onPointerMove as EventListener);
    this.#on(view, "pointerup", this.#onPointerUp as EventListener);
    this.#on(view, "pointercancel", this.#onPointerUp as EventListener);

    // A native image/link drag cancels the pointer stream, and text selection
    // fights the gesture. Both are gated on an active press so selections
    // anchored outside the carousel still drag across it.
    const blockDuringDrag = (event: Event): void => {
      if (this.#drag !== null) event.preventDefault();
    };
    this.#on(this.#track, "dragstart", blockDuringDrag);
    this.#on(this.#track, "selectstart", blockDuringDrag);
  }

  #wireFocusAndKeys(): void {
    this.#on(this.#root, "focusin", this.#onFocusIn as EventListener);
    this.#on(this.#root, "focusout", this.#onFocusOut as EventListener);
    this.#on(this.#root, "keydown", this.#onKeyDown as EventListener);
  }

  #wireVisibility(): void {
    const doc = this.#root.ownerDocument;
    const update = () => {
      if (doc.visibilityState === "hidden") this.#addReason("hidden");
      else this.#removeReason("hidden");
    };
    this.#on(doc, "visibilitychange", update);
    update();
  }

  #wireResize(): void {
    if (typeof ResizeObserver === "undefined") return;
    this.#observer = new ResizeObserver(() => this.#queueRemeasure());
    this.#observer.observe(this.#viewport);
    this.#observer.observe(this.#track);
  }

  #wireMediaQueries(): void {
    const view = this.#root.ownerDocument.defaultView;
    if (!view || typeof view.matchMedia !== "function") return;

    const queries: MediaQueryList[] = [];
    // 0.02px keeps the breakpoint itself out of both ranges, matching "above"/"below".
    if (this.#options.pauseAbove !== null) {
      queries.push(view.matchMedia(`(min-width: ${this.#options.pauseAbove + 0.02}px)`));
    }
    if (this.#options.pauseBelow !== null) {
      queries.push(view.matchMedia(`(max-width: ${this.#options.pauseBelow - 0.02}px)`));
    }
    if (queries.length === 0) return;

    const update = () => {
      if (queries.some((query) => query.matches)) this.#addReason("media");
      else this.#removeReason("media");
    };
    for (const query of queries) this.#listenMedia(query, update);
    update();
  }

  #wireReducedMotion(): void {
    if (!this.#options.respectReducedMotion) return;
    const view = this.#root.ownerDocument.defaultView;
    if (!view || typeof view.matchMedia !== "function") return;

    const query = view.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      this.#reducedMotion = query.matches;
      if (query.matches) this.#addReason("reduced-motion");
      else this.#removeReason("reduced-motion");
    };
    this.#listenMedia(query, update);
    update();
  }

  #listenMedia(query: MediaQueryList, handler: () => void): void {
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", handler);
      this.#teardown.push(() => query.removeEventListener("change", handler));
    }
  }

  // ---------------------------------------------------------- measurement

  #slideElements(): HTMLElement[] {
    return [...this.#originalSlides, ...this.#duplicates];
  }

  #readMetrics(slides: readonly HTMLElement[]): Metrics {
    // Wrap transforms move a slide's rect, so clear them before reading in this same frame.
    for (const slide of slides) slide.style.transform = "";
    const trackBox: BoxGeometry = readBox(this.#track);
    const gap = readGap(this.#track, trackBox.width);
    const boxes = slides.map(readBox);
    return buildMetrics(trackBox, slides, boxes, this.#rtl, gap);
  }

  #measure(): void {
    // Settle an in-flight tween first: its from/delta are absolute offsets in
    // the old geometry and would clobber the re-derived offset next frame.
    // Its done callback is deferred until the new geometry is live so a
    // reentrant next()/refresh() from an afterchange handler sees fresh metrics.
    const settledDone = this.#engine.settleTween();

    // Only overwrite the stored head from trustworthy geometry. A hidden
    // container measures all zeros; headAt on zero starts returns the last
    // index and would teleport the carousel on re-show.
    const previous = this.#engine.metrics;
    if (previous.contentSize > 0 && previous.slides.length > 0) {
      const h = headAt(previous.slides, this.#engine.offset);
      this.#head = { index: this.#logical(h.index), fraction: h.fraction };
    }

    this.#removeDuplicates();
    let slides = this.#slideElements();
    this.#applySlideStyles(slides);
    let metrics = this.#readMetrics(slides);

    // Arithmetic first, verified, bounded: estimate the clone sets needed from
    // the measured shortfall, append, and remeasure. Extra passes cover CSS
    // that resizes clones once they exist (last-child margins, subpixel rects).
    const n = this.#originalSlides.length;
    let passes = 0;
    while (
      needsMoreContent(metrics) &&
      n > 0 &&
      metrics.contentSize > GUARD_EPS &&
      passes < MAX_GUARD_PASSES
    ) {
      const perSet = metrics.contentSize / (slides.length / n);
      const shortfall =
        metrics.viewportSize + metrics.maxSlideSize - metrics.contentSize;
      let copies = Math.max(1, Math.ceil(shortfall / perSet));
      copies = Math.min(
        copies,
        Math.floor((MAX_SLIDE_ELEMENTS - slides.length) / n)
      );
      if (copies <= 0) break; // cap hit

      const before = metrics.contentSize;
      this.#addDuplicates(copies);
      slides = this.#slideElements();
      this.#applySlideStyles(slides);
      metrics = this.#readMetrics(slides);
      passes++;
      if (metrics.contentSize - before < GUARD_EPS) break; // zero-size clones: no livelock
    }

    this.#looping = !needsMoreContent(metrics);

    // Clamped mode runs on originals only: clones would be visible, reachable
    // duplicate content that is also aria-hidden.
    if (!this.#looping && this.#duplicates.length > 0) {
      this.#removeDuplicates();
      slides = this.#slideElements();
      metrics = this.#readMetrics(slides);
    }

    if (!this.#looping && metrics.contentSize > 0 && !this.#warnedNoLoop) {
      this.#warnedNoLoop = true;
      console.warn(
        "Multislider: not enough slide content to loop seamlessly within the duplication limit. Looping is disabled; add slides or narrow the viewport."
      );
    }

    this.#engine.looping = this.#looping;
    this.#engine.setMetrics(metrics);
    // Re-deriving the offset from the head index keeps the same slide leading
    // when a breakpoint changes every slide width. Degenerate metrics park at
    // zero and keep the stored head for the next good measure.
    this.#engine.setOffset(
      metrics.contentSize > 0
        ? offsetForHead(
            metrics.slides,
            this.#head.index,
            this.#head.fraction,
            metrics.contentSize
          )
        : 0
    );

    // Keep an active drag continuous: rebase its anchor so the next pointermove
    // reproduces the offset we just derived instead of one from old geometry.
    if (this.#drag) {
      const sign = this.#rtl ? -1 : 1;
      this.#drag.startOffset =
        this.#engine.offset + (this.#drag.lastX - this.#drag.startX) * sign;
    }

    this.#engine.render();

    // A focused slide removed by a content swap fires no focusout in some
    // browsers, which would hold the "focus" pause forever.
    if (!this.#root.contains(this.#root.ownerDocument.activeElement)) {
      this.#removeReason("focus");
    }

    settledDone?.();
  }

  #addDuplicates(copies: number): void {
    for (let c = 0; c < copies; c++) {
      for (const slide of this.#originalSlides) {
        const clone = slide.cloneNode(true) as HTMLElement;
        clone.removeAttribute("id");
        for (const child of Array.from(clone.querySelectorAll("[id]"))) {
          child.removeAttribute("id");
        }
        clone.setAttribute("aria-hidden", "true");
        clone.setAttribute("inert", "");
        clone.setAttribute(CLONE_ATTR, "");
        this.#track.appendChild(clone);
        this.#duplicates.push(clone);
      }
    }
  }

  #removeDuplicates(): void {
    for (const clone of this.#duplicates) clone.remove();
    this.#duplicates = [];
  }

  #queueRemeasure(): void {
    if (this.#destroyed || this.#resizeFrame !== 0) return;
    this.#resizeFrame = requestAnimationFrame(() => {
      this.#resizeFrame = 0;
      if (this.#destroyed) return;
      this.#measure();
      this.#syncLoop();
    });
  }

  // -------------------------------------------------------------- stepping

  #duration(): number {
    return this.#reducedMotion ? 0 : this.#options.duration;
  }

  #logical(index: number): number {
    const count = this.#originalSlides.length;
    return count > 0 ? modIndex(index, count) : index;
  }

  #pageCount(direction: 1 | -1): number {
    const metrics = this.#engine.metrics;
    const head = headAt(metrics.slides, this.#engine.offset).index;
    return pageRun(metrics.slides, head, metrics.viewportSize, direction);
  }

  #advance(direction: 1 | -1): void {
    if (this.#options.advanceBy === "page") {
      this.#step(direction, this.#pageCount(direction));
      return;
    }
    this.#step(direction, 1);
  }

  #step(direction: 1 | -1, count: number): void {
    if (this.#destroyed) return;
    // A queued step commits the one in flight first, so rapid clicks all land.
    this.#engine.finishTween();

    const metrics = this.#engine.metrics;
    const total = metrics.slides.length;
    // The contentSize guard kills event spam on hidden/zero-size content,
    // where looping stays true because 0 < 0 + 0 is false.
    if (total === 0 || count <= 0 || !(metrics.contentSize > 0)) return;

    const steps = Math.min(count, total);
    const head = headAt(metrics.slides, this.#engine.offset).index;

    if (!this.#looping) {
      // Clamped mode: no wrap arithmetic. Steps clamp to the hard edges,
      // land silently when nothing can move, and events report what
      // actually happened (a partial step can leave from === to).
      const max = this.#maxOffset(metrics);
      const dist = runDistance(metrics.slides, head, steps, direction);
      const dest = Math.min(
        Math.max(this.#engine.offset + direction * dist, 0),
        max
      );
      const delta = dest - this.#engine.offset;
      if (Math.abs(delta) < GUARD_EPS) return;
      const target = headAt(metrics.slides, dest).index;
      const detail: ChangeDetail = {
        from: this.#logical(head),
        to: this.#logical(target),
        direction,
        count: Math.abs(target - head),
      };
      if (!this.#emit("beforechange", detail, true)) return;
      this.#resetAutoplay();
      this.#engine.tween(delta, this.#duration(), () => {
        this.#emit("afterchange", detail);
        this.#syncLoop();
      });
      return;
    }

    const target =
      direction === 1
        ? modIndex(head + steps, total)
        : modIndex(head - steps, total);

    const detail: ChangeDetail = {
      from: this.#logical(head),
      to: this.#logical(target),
      direction,
      count: steps,
    };
    if (!this.#emit("beforechange", detail, true)) return;

    // Tween to the measured boundary, never by summed sizes: every step lands
    // exactly on slides[target].start, so float error cannot accumulate and a
    // fractional offset left by an interrupted momentum or marquee
    // self-realigns on the next step.
    const start = metrics.slides[target]?.start ?? 0;
    const delta = deltaToBoundary(
      this.#engine.offset,
      start,
      direction,
      metrics.contentSize
    );
    this.#resetAutoplay();
    this.#engine.tween(delta, this.#duration(), () => {
      this.#emit("afterchange", detail);
      this.#syncLoop();
    });
  }

  #maxOffset(metrics: Metrics): number {
    return Math.max(0, metrics.contentSize - metrics.viewportSize);
  }

  #autoAdvance(): void {
    const metrics = this.#engine.metrics;
    if (!(metrics.contentSize > 0)) return; // hidden/zero content: silent
    if (this.#looping) {
      this.#advance(1);
      return;
    }
    const max = this.#maxOffset(metrics);
    if (max <= GUARD_EPS) return; // nothing can move: silent
    if (this.#engine.offset >= max - GUARD_EPS) {
      this.#rewind(metrics);
      return;
    }
    this.#advance(1);
  }

  /** Clamped-mode autoplay at the far edge tweens back to the start. */
  #rewind(metrics: Metrics): void {
    const from = this.#logical(headAt(metrics.slides, this.#engine.offset).index);
    const detail: ChangeDetail = { from, to: 0, direction: -1, count: from };
    // A canceled rewind parks at the edge; the next tick retries.
    if (!this.#emit("beforechange", detail, true)) return;
    this.#resetAutoplay();
    this.#engine.tween(-this.#engine.offset, this.#duration(), () => {
      this.#emit("afterchange", detail);
      this.#syncLoop();
    });
  }

  #emit(
    name: "beforechange" | "afterchange" | "pause" | "play",
    detail: ChangeDetail | PauseDetail,
    cancelable = false
  ): boolean {
    return this.#root.dispatchEvent(
      new CustomEvent(`multislider:${name}`, { detail, bubbles: true, cancelable })
    );
  }

  // ------------------------------------------------------------- run state

  #addReason(reason: PauseReason): void {
    if (this.#destroyed || this.#reasons.has(reason)) return;
    const wasRunning = this.#reasons.size === 0;
    this.#reasons.add(reason);
    if (wasRunning) this.#emit("pause", { reasons: [...this.#reasons] });
    this.#syncLoop();
  }

  #removeReason(reason: PauseReason): void {
    if (this.#destroyed || !this.#reasons.delete(reason)) return;
    if (this.#reasons.size === 0) this.#emit("play", { reasons: [] });
    this.#syncLoop();
  }

  #syncLoop(): void {
    if (this.#destroyed) return;
    this.#syncLiveRegion();
    const running = this.#reasons.size === 0;

    if (this.#mode === "marquee") {
      this.#stopAutoplay();
      if (!running) {
        if (this.#engine.jobKind === "marquee") this.#engine.cancel();
        return;
      }
      // A resize can flip #looping while a marquee runs; the clamp then pins
      // the offset at max and the job spins forever doing no-op renders.
      if (this.#engine.jobKind === "marquee" && !this.#looping) {
        this.#engine.cancel();
      }
      if (this.#engine.jobKind === null && this.#looping) {
        this.#engine.startMarquee(this.#options.speed);
      }
      return;
    }

    if (this.#engine.jobKind === "marquee") this.#engine.cancel();
    if (running && !this.#reducedMotion) this.#startAutoplay();
    else this.#stopAutoplay();
  }

  #startAutoplay(): void {
    if (this.#timer !== null || this.#options.interval <= 0) return;
    this.#timer = setInterval(() => {
      if (this.paused || this.#destroyed) return;
      this.#autoAdvance();
    }, this.#options.interval);
  }

  #stopAutoplay(): void {
    if (this.#timer === null) return;
    clearInterval(this.#timer);
    this.#timer = null;
  }

  #resetAutoplay(): void {
    if (this.#timer === null) return;
    this.#stopAutoplay();
    this.#startAutoplay();
  }

  // ----------------------------------------------------------------- input

  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    const allowed =
      target === this.#root ||
      target === this.#prevButton ||
      target === this.#nextButton;
    if (!allowed) return;
    event.preventDefault();
    // The arrow points at the edge new content enters from; RTL flips that edge.
    this.#advance((event.key === "ArrowRight") !== this.#rtl ? 1 : -1);
  };

  #onFocusIn = (event: FocusEvent): void => {
    this.#addReason("focus");
    const target = event.target;
    if (!(target instanceof Element) || !this.#track.contains(target)) return;
    this.#revealSlideOf(target);
  };

  #onFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && this.#root.contains(next)) return;
    this.#removeReason("focus");
  };

  #revealSlideOf(target: Element): void {
    const { slides, contentSize, viewportSize } = this.#engine.metrics;
    const slide = slides.find((entry) => entry.el.contains(target));
    if (!slide) return;

    const position = wrappedPosition(slide.start, this.#engine.offset, contentSize);
    if (position + slide.size <= viewportSize) return;

    // Partly visible on the trailing edge: pull it in. Otherwise put it at the head.
    const offset =
      position < viewportSize ? slide.start + slide.size - viewportSize : slide.start;
    this.#engine.cancel();
    this.#engine.setOffset(offset);
    this.#engine.render();
    this.#syncLoop();
  }

  #onPointerDown = (event: PointerEvent): void => {
    if (this.#destroyed || this.#drag !== null) return;
    if (typeof event.button === "number" && event.button !== 0) return;

    this.#engine.cancel();
    this.#drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset: this.#engine.offset,
      lastX: event.clientX,
      lastTime: eventTime(event),
      velocity: 0,
      moved: false,
    };
    this.#addReason("drag");
    if (typeof this.#track.setPointerCapture === "function") {
      try {
        this.#track.setPointerCapture(event.pointerId);
      } catch {
        // capture is best effort; drag still works through window listeners
      }
    }
  };

  #onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const sign = this.#rtl ? -1 : 1;
    const dx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) > DRAG_THRESHOLD) drag.moved = true;
    if (!drag.moved) return;
    if (event.cancelable) event.preventDefault();

    this.#engine.setOffset(drag.startOffset - dx * sign);
    this.#engine.render();

    const now = eventTime(event);
    const dt = now - drag.lastTime;
    if (dt > 0) {
      drag.velocity = (-(event.clientX - drag.lastX) * sign) / dt;
      drag.lastX = event.clientX;
      drag.lastTime = now;
    }
  };

  #onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.#drag = null;

    if (typeof this.#track.releasePointerCapture === "function") {
      try {
        this.#track.releasePointerCapture(event.pointerId);
      } catch {
        // the pointer may already be released
      }
    }

    if (!drag.moved) {
      this.#removeReason("drag");
      return;
    }

    // A canceled pointer never produces a click, and its velocity reflects a
    // gesture the OS took over, so skip the blocker and settle without a fling.
    const canceled = event.type === "pointercancel";
    if (!canceled) this.#blockNextClick();
    this.#engine.startMomentum(canceled ? 0 : drag.velocity, () => {
      if (this.#mode === "step") this.#snap();
      else this.#syncLoop();
    });
    this.#removeReason("drag");
  };

  #snap(): void {
    const metrics = this.#engine.metrics;
    if (metrics.slides.length === 0) {
      this.#syncLoop();
      return;
    }
    const { index, fraction } = headAt(metrics.slides, this.#engine.offset);
    const slide = metrics.slides[index];
    if (!slide) {
      this.#syncLoop();
      return;
    }
    let target = fraction < 0.5 ? slide.start : slide.start + slide.size;
    if (!this.#looping) {
      // Clamp the snap target so the tween's endpoint is never beyond the
      // wall, where motion would pin early and idle out the duration.
      target = Math.min(Math.max(target, 0), this.#maxOffset(metrics));
    }
    let delta = target - this.#engine.offset;
    if (this.#looping) {
      // Shortest wrapped path. The correction is under half a slide and the
      // loop guard keeps every slide strictly under contentSize, so the
      // magnitude is strictly under contentSize / 2 and the seam-promoted
      // head ({0, 0} at an offset near contentSize) resolves to a tiny
      // forward nudge instead of a full revolution.
      delta = normalizeOffset(delta, metrics.contentSize);
      if (delta > metrics.contentSize / 2) delta -= metrics.contentSize;
    }
    this.#engine.tween(delta, this.#duration(), () => this.#syncLoop());
  }

  #blockNextClick(): void {
    this.#unblockClick();
    const handler = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      this.#unblockClick();
    };
    this.#clickBlocker = handler;
    this.#root.addEventListener("click", handler, true);
    this.#clickBlockTimer = setTimeout(() => this.#unblockClick(), CLICK_BLOCK_MS);
  }

  #unblockClick(): void {
    if (this.#clickBlockTimer !== null) {
      clearTimeout(this.#clickBlockTimer);
      this.#clickBlockTimer = null;
    }
    if (this.#clickBlocker === null) return;
    this.#root.removeEventListener("click", this.#clickBlocker, true);
    this.#clickBlocker = null;
  }
}

function needsMoreContent(metrics: Metrics): boolean {
  return (
    metrics.contentSize + GUARD_EPS < metrics.viewportSize + metrics.maxSlideSize
  );
}

function normalizeCount(count: number): number {
  if (typeof count !== "number" || !Number.isFinite(count)) return 1;
  return Math.max(1, Math.floor(count));
}

function isHtmlElement(node: Element): node is HTMLElement {
  return node instanceof HTMLElement;
}

function eventTime(event: PointerEvent): number {
  return typeof event.timeStamp === "number" && event.timeStamp > 0
    ? event.timeStamp
    : performance.now();
}

function resolveRtl(root: HTMLElement, direction: string): boolean {
  if (direction === "rtl") return true;
  if (direction === "ltr") return false;
  const view = root.ownerDocument.defaultView;
  // Computed style is authoritative when it resolves: CSS direction can
  // override an ancestor dir attribute. The attribute walk only covers
  // environments that report neither value (detached documents, jsdom).
  if (view) {
    const computed = view.getComputedStyle(root).direction;
    if (computed === "rtl") return true;
    if (computed === "ltr") return false;
  }
  return root.closest("[dir]")?.getAttribute("dir")?.toLowerCase() === "rtl";
}
