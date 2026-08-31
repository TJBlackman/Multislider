import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Engine, easeInOutCubic } from "../src/engine";
import { installRaf, makeMetrics } from "./helpers";

type Raf = ReturnType<typeof installRaf>;

let raf: Raf;
let track: HTMLDivElement;

function engineWith(sizes: number[], viewportSize: number, rtl = false): Engine {
  const engine = new Engine(track, rtl);
  const metrics = makeMetrics(sizes, viewportSize);
  for (const slide of metrics.slides) track.appendChild(slide.el);
  engine.setMetrics(metrics);
  engine.render();
  return engine;
}

beforeEach(() => {
  raf = installRaf();
  track = document.createElement("div");
  document.body.appendChild(track);
});

afterEach(() => {
  raf.restore();
  track.remove();
});

describe("render", () => {
  it("translates the track by the negated offset", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    expect(track.style.transform).toBe("translate3d(0px, 0, 0)");
    engine.setOffset(120);
    engine.render();
    expect(track.style.transform).toBe("translate3d(-120px, 0, 0)");
  });

  it("flips the sign in RTL", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300, true);
    engine.setOffset(120);
    engine.render();
    expect(track.style.transform).toBe("translate3d(120px, 0, 0)");
    engine.setOffset(150);
    engine.render();
    const [first, last] = [engine.metrics.slides[0]!, engine.metrics.slides[4]!];
    expect(first.el.style.transform).toBe("translateX(-500px)");
    expect(last.el.style.transform).toBe("");
  });

  it("wraps a slide once it leaves the leading edge and unwraps it later", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    const first = engine.metrics.slides[0]!.el;
    expect(first.style.transform).toBe("");

    engine.setOffset(150);
    engine.render();
    expect(first.style.transform).toBe("translateX(500px)");

    engine.setOffset(50);
    engine.render();
    expect(first.style.transform).toBe("");
  });

  it("pushes slides past the trailing edge back by one content length", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    expect(engine.metrics.slides[3]!.el.style.transform).toBe("translateX(-500px)");
    expect(engine.metrics.slides[2]!.el.style.transform).toBe("");
  });

  it("only writes a slide transform when its wrap state changes", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    const first = engine.metrics.slides[0]!.el;
    engine.setOffset(150);
    engine.render();
    first.style.transform = "translateX(999px)";
    engine.setOffset(160);
    engine.render();
    expect(first.style.transform).toBe("translateX(999px)");
  });

  it("leaves slides untransformed when looping is off", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    engine.setOffset(150);
    engine.render();
    engine.looping = false;
    engine.setOffset(150);
    engine.render();
    for (const slide of engine.metrics.slides) {
      expect(slide.el.style.transform).toBe("");
    }
  });
});

describe("offset clamping", () => {
  it("wraps into the content while looping", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    engine.setOffset(500);
    expect(engine.offset).toBe(0);
    engine.setOffset(-50);
    expect(engine.offset).toBe(450);
  });

  it("clamps to the scrollable range when looping is off", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    engine.looping = false;
    engine.setOffset(1000);
    expect(engine.offset).toBe(200);
    engine.setOffset(-10);
    expect(engine.offset).toBe(0);
  });

  it("stays at zero with no content", () => {
    const engine = new Engine(track, false);
    engine.setOffset(120);
    expect(engine.offset).toBe(0);
  });
});

describe("tween", () => {
  it("applies instantly with a zero duration", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    const done = vi.fn();
    engine.tween(100, 0, done);
    expect(engine.offset).toBe(100);
    expect(done).toHaveBeenCalledTimes(1);
    expect(raf.pending).toBe(0);
  });

  it("eases across frames and lands exactly on the target", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    const done = vi.fn();
    engine.tween(100, 100, done);
    expect(engine.jobKind).toBe("tween");

    raf.step(0);
    expect(engine.offset).toBe(0);
    raf.step(50);
    expect(engine.offset).toBeCloseTo(100 * easeInOutCubic(0.5), 6);
    expect(done).not.toHaveBeenCalled();
    raf.step(50);
    expect(engine.offset).toBe(100);
    expect(done).toHaveBeenCalledTimes(1);
    expect(engine.jobKind).toBeNull();
  });

  it("jumps an in-flight tween to its end", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    const done = vi.fn();
    engine.tween(100, 500, done);
    raf.step(0);
    raf.step(16);
    engine.finishTween();
    expect(engine.offset).toBe(100);
    expect(done).toHaveBeenCalledTimes(1);
    expect(engine.jobKind).toBeNull();
  });
});

describe("marquee and momentum", () => {
  it("advances the offset at the requested pixels per second", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    engine.startMarquee(1000);
    raf.step(0);
    raf.step(100);
    expect(engine.offset).toBeCloseTo(100, 6);
    raf.step(100);
    expect(engine.offset).toBeCloseTo(200, 6);
  });

  it("reseeds its clock when restarted so a pause does not jump", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    engine.startMarquee(1000);
    raf.step(0);
    raf.step(100);
    engine.cancel();
    raf.step(5000);
    engine.startMarquee(1000);
    raf.step(0);
    raf.step(50);
    expect(engine.offset).toBeCloseTo(150, 6);
  });

  it("refuses to run a marquee without looping", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    engine.looping = false;
    engine.startMarquee(60);
    expect(engine.jobKind).toBeNull();
  });

  it("decays momentum and then reports done", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    const done = vi.fn();
    engine.startMomentum(0.5, done);
    expect(engine.jobKind).toBe("momentum");
    for (let i = 0; i < 300 && engine.jobKind !== null; i++) raf.step(16);
    expect(done).toHaveBeenCalledTimes(1);
    expect(engine.offset).toBeGreaterThan(0);
    expect(engine.offset).toBeLessThan(200);
  });

  it("skips momentum below the stop threshold", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    const done = vi.fn();
    engine.startMomentum(0.001, done);
    expect(done).toHaveBeenCalledTimes(1);
    expect(engine.jobKind).toBeNull();
  });

  it("stops scheduling frames after destroy", () => {
    const engine = engineWith([100, 100, 100, 100, 100], 300);
    engine.startMarquee(1000);
    engine.destroy();
    expect(raf.pending).toBe(0);
    engine.startMarquee(1000);
    expect(raf.pending).toBe(0);
  });
});
