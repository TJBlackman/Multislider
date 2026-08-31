import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Multislider } from "../src/multislider";
import type { ChangeDetail, MultisliderOptions, PauseDetail } from "../src/types";
import { installRaf, makeMarkup, resetLayout, useLayout } from "./helpers";

type Raf = ReturnType<typeof installRaf>;

let raf: Raf;
let slider: Multislider | null = null;

const FIVE = [100, 100, 100, 100, 100];

function build(
  target: string | HTMLElement,
  options: MultisliderOptions = {}
): Multislider {
  slider = new Multislider(target, { interval: 0, duration: 0, ...options });
  return slider;
}

function trackOf(root: HTMLElement): HTMLElement {
  const track = root.querySelector<HTMLElement>(".ms-track");
  if (!track) throw new Error("no track");
  return track;
}

function collect(root: HTMLElement, type: string): CustomEvent[] {
  const seen: CustomEvent[] = [];
  document.body.addEventListener(`multislider:${type}`, (event) => {
    seen.push(event as CustomEvent);
  });
  return seen;
}

beforeEach(() => {
  raf = installRaf();
});

afterEach(() => {
  slider?.destroy();
  slider = null;
  raf.restore();
  resetLayout();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("initialization", () => {
  it("creates a track, moves the slides into it and enforces the critical styles", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    build(root);

    const viewport = root.querySelector<HTMLElement>(".MS-content")!;
    const track = trackOf(root);
    expect(track.parentElement).toBe(viewport);
    expect(viewport.children).toHaveLength(1);
    expect(track.children).toHaveLength(5);
    expect(viewport.style.overflow).toBe("hidden");
    expect(track.style.display).toBe("flex");
    expect(track.style.width).toBe("100%");
    expect(track.style.willChange).toBe("transform");
    for (const slide of Array.from(track.children)) {
      expect((slide as HTMLElement).style.flex).toBe("0 0 auto");
    }
  });

  it("accepts a selector string and exposes the root element", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build("#slider");
    expect(instance.element).toBe(root);
    expect(Multislider.get(root)).toBe(instance);
  });

  it("adds carousel semantics without stomping an existing label", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    root.setAttribute("aria-label", "Featured products");
    build(root);

    expect(root.getAttribute("role")).toBe("region");
    expect(root.getAttribute("aria-roledescription")).toBe("carousel");
    expect(root.getAttribute("aria-label")).toBe("Featured products");
    expect(
      root.querySelector('[data-ms="prev"]')?.getAttribute("aria-label")
    ).toBe("Previous slide");
    expect(
      root.querySelector('[data-ms="next"]')?.getAttribute("aria-label")
    ).toBe("Next slide");
  });

  it("labels the region when the user gave no label", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    build(root);
    expect(root.getAttribute("aria-label")).toBe("slideshow");
  });

  it("gives slides group semantics and positional labels", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root);
    const first = trackOf(root).children[0]!;

    expect(first.getAttribute("role")).toBe("group");
    expect(first.getAttribute("aria-roledescription")).toBe("slide");
    expect(first.getAttribute("aria-label")).toBe("1 of 5");

    instance.destroy();
    slider = null;
    expect(first.hasAttribute("role")).toBe(false);
    expect(first.hasAttribute("aria-label")).toBe(false);
  });

  it("keeps the live region off while rotating and polite while paused", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root, { interval: 2000 });
    const track = trackOf(root);

    expect(track.getAttribute("aria-live")).toBe("off");
    instance.pause();
    expect(track.getAttribute("aria-live")).toBe("polite");
    instance.play();
    expect(track.getAttribute("aria-live")).toBe("off");
  });

  it("marks the live region polite when autoplay is disabled", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    build(root); // interval: 0
    expect(trackOf(root).getAttribute("aria-live")).toBe("polite");
  });

  it("throws for a missing target, a missing viewport and a double init", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    expect(() => new Multislider("#nope")).toThrow(/no element matched/);

    const bare = document.createElement("div");
    document.body.appendChild(bare);
    expect(() => new Multislider(bare)).toThrow(/no viewport/);

    const root = makeMarkup(5);
    build(root);
    expect(() => new Multislider(root)).toThrow(/already initialized/);
  });

  it("supports two independent instances on one page", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const a = makeMarkup(5);
    const b = makeMarkup(5);
    const first = new Multislider(a, { interval: 0, duration: 0 });
    const second = new Multislider(b, { interval: 0, duration: 0 });

    first.next();
    expect(trackOf(a).style.transform).toBe("translate3d(-100px, 0, 0)");
    expect(trackOf(b).style.transform).toBe("translate3d(0px, 0, 0)");

    first.destroy();
    second.destroy();
  });
});

describe("stepping and events", () => {
  it("fires beforechange then afterchange with logical indices", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const before = collect(root, "beforechange");
    const after = collect(root, "afterchange");
    const instance = build(root);

    instance.next();
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    expect(before[0]!.detail as ChangeDetail).toEqual({
      from: 0,
      to: 1,
      direction: 1,
      count: 1,
    });
    expect(before[0]!.bubbles).toBe(true);
    expect(before[0]!.cancelable).toBe(true);
    expect(after[0]!.cancelable).toBe(false);
    expect(trackOf(root).style.transform).toBe("translate3d(-100px, 0, 0)");
  });

  it("wraps backwards from the first slide", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const before = collect(root, "beforechange");
    const instance = build(root);

    instance.prev();
    expect(before[0]!.detail as ChangeDetail).toEqual({
      from: 0,
      to: 4,
      direction: -1,
      count: 1,
    });
    expect(trackOf(root).style.transform).toBe("translate3d(-400px, 0, 0)");
  });

  it("steps by a count", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const before = collect(root, "beforechange");
    const instance = build(root);

    instance.next(3);
    expect(before[0]!.detail as ChangeDetail).toMatchObject({ to: 3, count: 3 });
    expect(trackOf(root).style.transform).toBe("translate3d(-300px, 0, 0)");
  });

  it("blocks the step when beforechange is cancelled", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    root.addEventListener("multislider:beforechange", (event) =>
      event.preventDefault()
    );
    const after = collect(root, "afterchange");
    const instance = build(root);

    instance.next();
    expect(after).toHaveLength(0);
    expect(trackOf(root).style.transform).toBe("translate3d(0px, 0, 0)");
  });

  it("pages by the smallest run that covers the viewport", () => {
    useLayout({ viewport: 300, sizes: [100, 250, 50, 300, 120] });
    const root = makeMarkup(5);
    const before = collect(root, "beforechange");
    const instance = build(root);

    instance.nextPage();
    expect(before[0]!.detail as ChangeDetail).toMatchObject({ to: 2, count: 2 });
    expect(trackOf(root).style.transform).toBe("translate3d(-350px, 0, 0)");

    instance.prevPage();
    expect(before[1]!.detail as ChangeDetail).toMatchObject({
      from: 2,
      to: 0,
      count: 2,
      direction: -1,
    });
    expect(trackOf(root).style.transform).toBe("translate3d(0px, 0, 0)");
  });

  it("drives the buttons with advanceBy", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root, { advanceBy: "page" });
    const next = root.querySelector<HTMLElement>('[data-ms="next"]')!;
    const prev = root.querySelector<HTMLElement>('[data-ms="prev"]')!;

    next.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(trackOf(root).style.transform).toBe("translate3d(-300px, 0, 0)");
    prev.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(trackOf(root).style.transform).toBe("translate3d(0px, 0, 0)");
    expect(instance.paused).toBe(false);
  });

  it("moves on arrow keys when the root has focus", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    build(root);

    root.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    );
    expect(trackOf(root).style.transform).toBe("translate3d(-100px, 0, 0)");
    root.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
    );
    expect(trackOf(root).style.transform).toBe("translate3d(0px, 0, 0)");
  });

  it("flips arrow keys in RTL so they follow visual direction", () => {
    useLayout({ viewport: 300, sizes: FIVE, rtl: true });
    const root = makeMarkup(5);
    build(root, { direction: "rtl" });

    // In RTL new content enters from the left, so ArrowLeft advances.
    root.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
    );
    expect(trackOf(root).style.transform).toBe("translate3d(100px, 0, 0)");
    root.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    );
    expect(trackOf(root).style.transform).toBe("translate3d(0px, 0, 0)");
  });

  it("ignores arrow keys with modifiers or an already handled event", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    build(root);

    const withCtrl = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    root.dispatchEvent(withCtrl);
    expect(trackOf(root).style.transform).toBe("translate3d(0px, 0, 0)");
    // the browser shortcut must not be swallowed either
    expect(withCtrl.defaultPrevented).toBe(false);

    const handled = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    root.dispatchEvent(handled);
    expect(trackOf(root).style.transform).toBe("translate3d(0px, 0, 0)");
  });

  it("ignores arrow keys when focus is inside a slide", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    build(root);
    const slide = trackOf(root).children[0]!;

    slide.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    );
    expect(trackOf(root).style.transform).toBe("translate3d(0px, 0, 0)");
  });

  it("steps while paused", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root);
    instance.pause();
    instance.next();
    expect(instance.paused).toBe(true);
    expect(trackOf(root).style.transform).toBe("translate3d(-100px, 0, 0)");
  });
});

describe("pause reasons", () => {
  it("emits pause once the set fills and play once it empties", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const paused = collect(root, "pause");
    const played = collect(root, "play");
    const instance = build(root);
    const viewport = root.querySelector<HTMLElement>(".MS-content")!;

    instance.pause();
    expect(instance.paused).toBe(true);
    expect(paused).toHaveLength(1);
    expect((paused[0]!.detail as PauseDetail).reasons).toEqual(["api"]);

    viewport.dispatchEvent(new Event("pointerenter"));
    expect(paused).toHaveLength(1); // already paused, no second event

    instance.play();
    expect(instance.paused).toBe(true); // hover still holds it
    expect(played).toHaveLength(0);

    viewport.dispatchEvent(new Event("pointerleave"));
    expect(instance.paused).toBe(false);
    expect(played).toHaveLength(1);
    expect((played[0]!.detail as PauseDetail).reasons).toEqual([]);
  });

  it("ignores hover when hoverPause is off", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root, { hoverPause: false });
    root
      .querySelector<HTMLElement>(".MS-content")!
      .dispatchEvent(new Event("pointerenter"));
    expect(instance.paused).toBe(false);
  });

  it("pauses while the document is hidden", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root);

    const state = { value: "hidden" };
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => state.value,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(instance.paused).toBe(true);

    state.value = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(instance.paused).toBe(false);
  });
});

describe("autoplay and marquee", () => {
  it("advances on the interval and stops while paused", () => {
    vi.useFakeTimers();
    try {
      useLayout({ viewport: 300, sizes: FIVE });
      const root = makeMarkup(5);
      const instance = build(root, { interval: 1000 });

      vi.advanceTimersByTime(1000);
      expect(trackOf(root).style.transform).toBe("translate3d(-100px, 0, 0)");

      instance.pause();
      vi.advanceTimersByTime(5000);
      expect(trackOf(root).style.transform).toBe("translate3d(-100px, 0, 0)");

      instance.play();
      vi.advanceTimersByTime(1000);
      expect(trackOf(root).style.transform).toBe("translate3d(-200px, 0, 0)");
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs the marquee at the configured speed and honours setMode", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root, { mode: "marquee", speed: 1000 });

    raf.step(0);
    raf.step(100);
    expect(trackOf(root).style.transform).toBe("translate3d(-100px, 0, 0)");

    instance.setMode("step");
    raf.step(100);
    expect(trackOf(root).style.transform).toBe("translate3d(-100px, 0, 0)");

    instance.setMode("marquee");
    raf.step(0);
    raf.step(50);
    expect(trackOf(root).style.transform).toBe("translate3d(-150px, 0, 0)");
  });
});

describe("loop guard", () => {
  it("duplicates the slide set when the content cannot cover the wrap", () => {
    useLayout({ viewport: 300, sizes: [100, 100, 100] });
    const root = makeMarkup(3);
    build(root);
    const track = trackOf(root);

    expect(track.children).toHaveLength(6);
    const clones = Array.from(track.querySelectorAll("[data-ms-clone]"));
    expect(clones).toHaveLength(3);
    for (const clone of clones) {
      expect(clone.getAttribute("aria-hidden")).toBe("true");
      expect(clone.hasAttribute("inert")).toBe(true);
    }
  });

  it("reports duplicate positions with the original slide indices", () => {
    useLayout({ viewport: 300, sizes: [100, 100, 100] });
    const root = makeMarkup(3);
    const before = collect(root, "beforechange");
    const instance = build(root);

    instance.next(4);
    expect(before[0]!.detail as ChangeDetail).toMatchObject({ from: 0, to: 1 });
  });

  it("computes the needed clone sets arithmetically on ultrawide viewports", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    useLayout({ viewport: 3840, sizes: [200, 200, 200] });
    const root = makeMarkup(3);
    build(root);

    // shortfall (3840 + 200 - 600) needs 6 extra sets: 21 slides, 4200px
    expect(trackOf(root).children).toHaveLength(21);
    expect(warn).not.toHaveBeenCalled();
  });

  it("duplicates several viewports worth for a single wide slide", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    useLayout({ viewport: 1000, sizes: [100] });
    const root = makeMarkup(1);
    build(root);

    // 10 clones close the 1000px shortfall and looping stays on
    expect(trackOf(root).children).toHaveLength(11);
    expect(warn).not.toHaveBeenCalled();
  });

  it("disables looping, warns once, and drops clones at the element cap", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    useLayout({ viewport: 8000, sizes: [10, 10, 10] });
    const root = makeMarkup(3);
    const instance = build(root);

    // 600 slides of 10px cannot cover 8000px, so clamped mode runs on
    // originals only with no aria-hidden duplicates of visible content
    expect(warn).toHaveBeenCalledTimes(1);
    expect(root.querySelectorAll("[data-ms-clone]")).toHaveLength(0);
    expect(trackOf(root).children).toHaveLength(3);

    instance.next(1);
    // clamped: 30px of content in an 8000px viewport cannot move
    expect(trackOf(root).style.transform).toBe("translate3d(0px, 0, 0)");
  });
});

describe("clamped mode", () => {
  // 301 originals block even one clone set under the 600 element cap while
  // content (6020) still exceeds the viewport (6010), so max offset is 10.
  function clampedSetup(options = {}) {
    useLayout({ viewport: 6010, sizes: Array(301).fill(20) });
    const root = makeMarkup(301);
    const instance = build(root, options);
    return { root, instance, track: trackOf(root) };
  }

  it("steps clamp to the hard edge and go silent there", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { root, instance, track } = clampedSetup();
    const before = collect(root, "beforechange");

    instance.next();
    expect(track.style.transform).toBe("translate3d(-10px, 0, 0)");
    expect(before).toHaveLength(1);
    expect(before[0]!.detail as ChangeDetail).toMatchObject({
      direction: 1,
      count: 0, // partial step: no full index crossed
    });

    instance.next(); // pinned at the wall: no motion, no events
    expect(track.style.transform).toBe("translate3d(-10px, 0, 0)");
    expect(before).toHaveLength(1);

    instance.prev();
    expect(track.style.transform).toBe("translate3d(0px, 0, 0)");
    instance.prev(); // pinned at the start
    expect(before).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("autoplay rewinds to the start at the far edge", () => {
    vi.useFakeTimers();
    try {
      const { root, track } = clampedSetup({ interval: 100 });
      const after = collect(root, "afterchange");

      vi.advanceTimersByTime(100); // advances to the wall
      expect(track.style.transform).toBe("translate3d(-10px, 0, 0)");

      vi.advanceTimersByTime(100); // rewinds as a single backward transition
      expect(track.style.transform).toBe("translate3d(0px, 0, 0)");
      expect(after).toHaveLength(2);
      expect((after[1]!.detail as ChangeDetail).direction).toBe(-1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays silent when nothing can move at all", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    useLayout({ viewport: 8000, sizes: [10, 10, 10] });
    const root = makeMarkup(3);
    const instance = build(root);
    const before = collect(root, "beforechange");

    instance.next();
    instance.prev();
    expect(before).toHaveLength(0);
    expect(trackOf(root).style.transform).toBe("translate3d(0px, 0, 0)");
  });
});

describe("refresh and resize", () => {
  it("keeps the same slide leading after the geometry changes", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root);

    instance.next();
    expect(trackOf(root).style.transform).toBe("translate3d(-100px, 0, 0)");

    useLayout({ viewport: 150, sizes: [50, 50, 50, 50, 50] });
    instance.refresh();
    expect(trackOf(root).style.transform).toBe("translate3d(-50px, 0, 0)");
  });

  it("drops the duplicate set once the real slides are wide enough", () => {
    useLayout({ viewport: 300, sizes: [100, 100, 100] });
    const root = makeMarkup(3);
    const instance = build(root);
    expect(trackOf(root).children).toHaveLength(6);

    useLayout({ viewport: 100, sizes: [100, 100, 100] });
    instance.refresh();
    expect(trackOf(root).children).toHaveLength(3);
    expect(root.querySelectorAll("[data-ms-clone]")).toHaveLength(0);
  });

  it("coalesces resize observer callbacks into one frame", () => {
    const callbacks: ResizeObserverCallback[] = [];
    class FakeObserver {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = FakeObserver as unknown as typeof ResizeObserver;

    try {
      useLayout({ viewport: 300, sizes: FIVE });
      const root = makeMarkup(5);
      const instance = build(root);
      instance.next();
      expect(callbacks).toHaveLength(1);

      useLayout({ viewport: 150, sizes: [50, 50, 50, 50, 50] });
      const fire = callbacks[0]!;
      fire([], {} as ResizeObserver);
      fire([], {} as ResizeObserver);
      expect(raf.pending).toBe(1);

      raf.step();
      expect(trackOf(root).style.transform).toBe("translate3d(-50px, 0, 0)");
      expect(raf.pending).toBe(0);
    } finally {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
  });
});

describe("flex gap on the track", () => {
  it("steps by slide size plus gap and wraps at the gapped period", () => {
    useLayout({ viewport: 200, sizes: [100, 150, 80], gap: 10 });
    const root = makeMarkup(3);
    build(root);
    const track = trackOf(root);

    // contentSize 360 satisfies the loop guard (200 + 160), so no clones
    expect(track.children).toHaveLength(3);

    // the slide fully right of the viewport wraps back by the full period
    const last = track.children[2] as HTMLElement;
    expect(last.style.transform).toBe("translateX(-360px)");

    slider!.next();
    expect(track.style.transform).toBe("translate3d(-110px, 0, 0)");
    slider!.next();
    expect(track.style.transform).toBe("translate3d(-270px, 0, 0)");
    slider!.next(); // full cycle: 110 + 160 + 90 = 360 wraps to 0
    expect(track.style.transform).toBe("translate3d(0px, 0, 0)");
  });

  it("handles gap in RTL with the same logical metrics", () => {
    useLayout({ viewport: 200, sizes: [100, 150, 80], gap: 10, rtl: true });
    const root = makeMarkup(3);
    build(root, { direction: "rtl" });
    const track = trackOf(root);

    slider!.next();
    expect(track.style.transform).toBe("translate3d(110px, 0, 0)");
  });
});

describe("remeasure during motion", () => {
  it("settles a mid-flight tween into the new geometry without a zombie frame", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root, { duration: 300 });
    const after = collect(root, "afterchange");

    instance.next();
    raf.run(5); // mid tween
    useLayout({ viewport: 300, sizes: [50, 50, 50, 50, 50] });
    instance.refresh();

    // The tween target (head index 1) survives into the new slide widths.
    expect(trackOf(root).style.transform).toBe("translate3d(-50px, 0, 0)");
    expect(after).toHaveLength(1);

    raf.run(5); // any zombie tween frame would move the offset again
    expect(trackOf(root).style.transform).toBe("translate3d(-50px, 0, 0)");
  });

  it("gives a reentrant next() from afterchange the new metrics", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root, { duration: 300 });
    let calls = 0;
    root.addEventListener("multislider:afterchange", () => {
      calls += 1;
      if (calls === 1) instance.next();
    });

    instance.next();
    raf.run(5);
    useLayout({ viewport: 300, sizes: [50, 50, 50, 50, 50] });
    instance.refresh();
    raf.run(30); // let the reentrant tween finish

    // 50px (settled head 1) plus one new-geometry slide of 50px.
    expect(trackOf(root).style.transform).toBe("translate3d(-100px, 0, 0)");
    expect(calls).toBe(2);
  });

  it("keeps an active drag continuous across a remeasure", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root);
    const track = trackOf(root);

    const pointer = (type: string, clientX: number, timeStamp: number): Event => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
      Object.defineProperty(event, "pointerId", { value: 1 });
      Object.defineProperty(event, "timeStamp", { value: timeStamp });
      return event;
    };

    // nonzero timestamps so eventTime() uses them and lastX tracks the pointer
    track.dispatchEvent(pointer("pointerdown", 200, 8));
    window.dispatchEvent(pointer("pointermove", 150, 24));
    expect(track.style.transform).toBe("translate3d(-50px, 0, 0)");

    useLayout({ viewport: 300, sizes: [50, 50, 50, 50, 50] });
    instance.refresh(); // head 0 at fraction 0.5 of a 50px slide = offset 25

    window.dispatchEvent(pointer("pointermove", 149, 40));
    expect(track.style.transform).toBe("translate3d(-26px, 0, 0)");
  });

  it("completes a step to the measured boundary from a marquee offset", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root, { mode: "marquee", speed: 1000 });
    const before = collect(root, "beforechange");

    raf.step(16); // seeds the marquee clock
    raf.step(60); // 60px at 1000px/s
    expect(trackOf(root).style.transform).toBe("translate3d(-60px, 0, 0)");

    instance.next();
    // boundary targeted: lands exactly on slide 1, not 60 + 100
    expect(trackOf(root).style.transform).toBe("translate3d(-100px, 0, 0)");
    expect(before[0]!.detail as ChangeDetail).toMatchObject({ from: 0, to: 1 });
  });

  it("treats next(total) as one full revolution", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root);
    const before = collect(root, "beforechange");

    instance.next(5);
    expect(trackOf(root).style.transform).toBe("translate3d(0px, 0, 0)");
    expect(before[0]!.detail as ChangeDetail).toMatchObject({
      from: 0,
      to: 0,
      count: 5,
    });
  });

  it("survives a display:none round trip without losing its place", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root);
    instance.next();
    instance.next();
    expect(trackOf(root).style.transform).toBe("translate3d(-200px, 0, 0)");

    // hidden: everything measures zero
    useLayout({ viewport: 0, sizes: [0, 0, 0, 0, 0] });
    instance.refresh();

    // shown again: same head slide leads
    useLayout({ viewport: 300, sizes: FIVE });
    instance.refresh();
    expect(trackOf(root).style.transform).toBe("translate3d(-200px, 0, 0)");
  });

  it("fires no change events while everything measures zero", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root);
    const before = collect(root, "beforechange");

    useLayout({ viewport: 0, sizes: [0, 0, 0, 0, 0] });
    instance.refresh();
    instance.next();
    instance.prev();
    expect(before).toHaveLength(0);
  });

  it("stops a marquee when a resize disables looping and restarts it after", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root, { mode: "marquee", speed: 60 });
    raf.run(3);
    const moving = trackOf(root).style.transform;
    expect(moving).not.toBe("translate3d(0px, 0, 0)");

    // grow the viewport so even capped duplication cannot satisfy the guard
    useLayout({ viewport: 8000, sizes: [10, 10, 10, 10, 10] });
    instance.refresh();
    const pinned = trackOf(root).style.transform;
    raf.run(3);
    expect(trackOf(root).style.transform).toBe(pinned);
    expect(raf.pending).toBe(0);

    // growing content back re-enables looping and the marquee resumes
    useLayout({ viewport: 300, sizes: FIVE });
    instance.refresh();
    raf.run(3);
    expect(trackOf(root).style.transform).not.toBe(pinned);
  });
});

describe("focus", () => {
  it("jumps so the focused slide is visible and pauses while focus is inside", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root);
    const last = trackOf(root).children[4] as HTMLElement;

    last.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(trackOf(root).style.transform).toBe("translate3d(-400px, 0, 0)");
    expect(instance.paused).toBe(true);

    root.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(instance.paused).toBe(false);
  });

  it("keeps the focus pause when a pointer enters and leaves", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root);
    const viewport = root.querySelector<HTMLElement>(".MS-content")!;

    root.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    viewport.dispatchEvent(new Event("pointerenter"));
    viewport.dispatchEvent(new Event("pointerleave"));
    expect(instance.paused).toBe(true);

    root.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(instance.paused).toBe(false);
  });

  it("keeps the hover pause when focus enters and leaves", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root);
    const viewport = root.querySelector<HTMLElement>(".MS-content")!;

    viewport.dispatchEvent(new Event("pointerenter"));
    root.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    root.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(instance.paused).toBe(true);

    viewport.dispatchEvent(new Event("pointerleave"));
    expect(instance.paused).toBe(false);
  });

  it("pauses on focus even with hoverPause disabled", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root, { hoverPause: false });

    root.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(instance.paused).toBe(true);
    root.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(instance.paused).toBe(false);
  });

  it('reports "focus" in the pause event detail', () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    build(root);
    const paused = collect(root, "pause");

    root.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(paused).toHaveLength(1);
    expect((paused[0]!.detail as PauseDetail).reasons).toEqual(["focus"]);
  });

  it("drops a stale focus pause on refresh when focus left without focusout", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root);

    // Synthetic focusin with document.activeElement still on body models a
    // focused slide being removed without any focusout firing.
    root.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(instance.paused).toBe(true);

    instance.refresh();
    expect(instance.paused).toBe(false);
  });
});

describe("rtl", () => {
  it("flips the single sign used for motion", () => {
    useLayout({ viewport: 300, sizes: FIVE, rtl: true });
    const root = makeMarkup(5);
    const instance = build(root, { direction: "rtl" });

    expect(trackOf(root).style.transform).toBe("translate3d(0px, 0, 0)");
    instance.next();
    expect(trackOf(root).style.transform).toBe("translate3d(100px, 0, 0)");
    instance.prev();
    expect(trackOf(root).style.transform).toBe("translate3d(0px, 0, 0)");
  });
});

describe("destroy", () => {
  it("restores the original markup exactly", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const original = root.innerHTML;
    const slides = Array.from(
      root.querySelectorAll<HTMLElement>(".MS-content > .item")
    );

    const instance = build(root);
    expect(root.innerHTML).not.toBe(original);

    instance.destroy();
    slider = null;

    expect(root.innerHTML).toBe(original);
    expect(root.hasAttribute("role")).toBe(false);
    expect(root.hasAttribute("aria-roledescription")).toBe(false);
    expect(root.hasAttribute("aria-label")).toBe(false);
    expect(root.querySelector(".ms-track")).toBeNull();
    // the original slide nodes are reused, not recreated
    expect(
      Array.from(root.querySelectorAll<HTMLElement>(".MS-content > .item"))
    ).toEqual(slides);
    expect(Multislider.get(root)).toBeUndefined();
  });

  it("puts back inline styles it did not own and drops clones", () => {
    useLayout({ viewport: 300, sizes: [100, 100, 100] });
    const root = makeMarkup(3);
    const viewport = root.querySelector<HTMLElement>(".MS-content")!;
    viewport.setAttribute("style", "background: red;");
    const firstSlide = viewport.querySelector<HTMLElement>(".item")!;
    firstSlide.setAttribute("style", "color: blue;");

    const instance = build(root);
    expect(root.querySelectorAll("[data-ms-clone]")).toHaveLength(3);

    instance.destroy();
    slider = null;

    expect(viewport.getAttribute("style")).toBe("background: red;");
    expect(firstSlide.getAttribute("style")).toBe("color: blue;");
    expect(root.querySelectorAll("[data-ms-clone]")).toHaveLength(0);
    expect(viewport.querySelectorAll(".item")).toHaveLength(3);
  });

  it("is inert afterwards and can be re-initialized", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root);
    instance.destroy();
    slider = null;

    expect(() => instance.next()).not.toThrow();
    expect(() => instance.destroy()).not.toThrow();

    const again = new Multislider(root, { interval: 0, duration: 0 });
    expect(again.element).toBe(root);
    again.destroy();
  });

  it("stops the marquee loop", () => {
    useLayout({ viewport: 300, sizes: FIVE });
    const root = makeMarkup(5);
    const instance = build(root, { mode: "marquee", speed: 1000 });
    raf.step(0);
    expect(raf.pending).toBe(1);
    instance.destroy();
    slider = null;
    expect(raf.pending).toBe(0);
  });
});
