import { describe, expect, it } from "vitest";
import {
  buildMetrics,
  deltaToBoundary,
  headAt,
  modIndex,
  normalizeOffset,
  offsetForHead,
  pageRun,
  readGap,
  runDistance,
  wrapState,
  wrappedPosition,
} from "../src/measure";
import type { BoxGeometry, SlideMetric } from "../src/types";

function slides(sizes: number[]): SlideMetric[] {
  let start = 0;
  return sizes.map((size) => {
    const slide: SlideMetric = {
      el: document.createElement("div"),
      size,
      start,
    };
    start += size;
    return slide;
  });
}

function box(left: number, width: number, margin = 0): BoxGeometry {
  return {
    left,
    right: left + width,
    width,
    marginLeft: margin,
    marginRight: margin,
  };
}

describe("normalizeOffset", () => {
  it("keeps offsets inside the content", () => {
    expect(normalizeOffset(0, 500)).toBe(0);
    expect(normalizeOffset(120, 500)).toBe(120);
  });

  it("wraps past the end and before the start", () => {
    expect(normalizeOffset(500, 500)).toBe(0);
    expect(normalizeOffset(620, 500)).toBe(120);
    expect(normalizeOffset(-100, 500)).toBe(400);
    expect(normalizeOffset(-1100, 500)).toBe(400);
  });

  it("collapses to zero without content or with a broken number", () => {
    expect(normalizeOffset(200, 0)).toBe(0);
    expect(normalizeOffset(Number.NaN, 500)).toBe(0);
  });
});

describe("modIndex", () => {
  it("wraps both directions", () => {
    expect(modIndex(0, 5)).toBe(0);
    expect(modIndex(6, 5)).toBe(1);
    expect(modIndex(-1, 5)).toBe(4);
    expect(modIndex(-7, 5)).toBe(3);
    expect(modIndex(3, 0)).toBe(0);
  });
});

describe("wrappedPosition", () => {
  it("reports where a slide sits relative to the viewport start", () => {
    expect(wrappedPosition(0, 0, 500)).toBe(0);
    expect(wrappedPosition(300, 100, 500)).toBe(200);
    expect(wrappedPosition(0, 100, 500)).toBe(400);
  });
});

describe("wrapState", () => {
  const contentSize = 500;
  const viewportSize = 300;

  it("leaves visible slides alone", () => {
    expect(wrapState(0, 100, 0, contentSize, viewportSize)).toBe(0);
    expect(wrapState(200, 100, 0, contentSize, viewportSize)).toBe(0);
  });

  it("wraps a slide forward once it is fully off the leading edge", () => {
    expect(wrapState(0, 100, 99, contentSize, viewportSize)).toBe(0);
    expect(wrapState(0, 100, 100, contentSize, viewportSize)).toBe(1);
    expect(wrapState(100, 100, 250, contentSize, viewportSize)).toBe(1);
  });

  it("wraps a slide backward once it is fully past the trailing edge", () => {
    expect(wrapState(300, 100, 0, contentSize, viewportSize)).toBe(-1);
    expect(wrapState(300, 100, 1, contentSize, viewportSize)).toBe(0);
  });
});

describe("headAt", () => {
  it("finds the leading slide and how far into it the offset sits", () => {
    const list = slides([100, 200, 50, 150]);
    expect(headAt(list, 0)).toEqual({ index: 0, fraction: 0 });
    expect(headAt(list, 50)).toEqual({ index: 0, fraction: 0.5 });
    expect(headAt(list, 100)).toEqual({ index: 1, fraction: 0 });
    expect(headAt(list, 250)).toEqual({ index: 1, fraction: 0.75 });
    expect(headAt(list, 300)).toEqual({ index: 2, fraction: 0 });
    expect(headAt(list, 499).index).toBe(3);
  });

  it("returns a safe head with no slides", () => {
    expect(headAt([], 42)).toEqual({ index: 0, fraction: 0 });
  });
});

describe("offsetForHead", () => {
  it("keeps the same slide leading after slide sizes change", () => {
    const before = slides([100, 200, 50, 150]);
    const head = headAt(before, 200); // half way through slide 1
    expect(head).toEqual({ index: 1, fraction: 0.5 });

    const after = slides([40, 80, 40, 40]);
    expect(offsetForHead(after, head.index, head.fraction, 200)).toBe(80);
  });

  it("wraps the derived offset into the content", () => {
    const list = slides([100, 100]);
    expect(offsetForHead(list, 1, 0.999999, 200)).toBeCloseTo(199.9999, 3);
    expect(offsetForHead(list, 5, 0, 200)).toBe(100);
  });
});

describe("runDistance", () => {
  const list = slides([100, 200, 50, 150]);

  it("sums forward from the head", () => {
    expect(runDistance(list, 0, 1, 1)).toBe(100);
    expect(runDistance(list, 0, 3, 1)).toBe(350);
    expect(runDistance(list, 3, 2, 1)).toBe(250); // 150 then wraps to 100
  });

  it("sums backward from the slide before the head", () => {
    expect(runDistance(list, 0, 1, -1)).toBe(150);
    expect(runDistance(list, 2, 2, -1)).toBe(300);
  });
});

describe("pageRun", () => {
  it("covers the viewport with uneven slide widths", () => {
    const uneven = slides([100, 250, 50, 300, 120]);
    expect(pageRun(uneven, 0, 300, 1)).toBe(2); // 100 + 250
    expect(pageRun(uneven, 1, 300, 1)).toBe(2); // 250 is short, 250 + 50 covers it
    expect(pageRun(uneven, 2, 300, 1)).toBe(2); // 50 + 300
    expect(pageRun(uneven, 3, 300, 1)).toBe(1); // 300 alone
  });

  it("walks backward for the previous page", () => {
    const uneven = slides([100, 250, 50, 300, 120]);
    expect(pageRun(uneven, 0, 300, -1)).toBe(2); // 120 then 300
    expect(pageRun(uneven, 2, 300, -1)).toBe(2); // 250 then 100
  });

  it("never returns zero and never exceeds the slide count", () => {
    const list = slides([100, 100, 100]);
    expect(pageRun(list, 0, 0, 1)).toBe(1);
    expect(pageRun(list, 0, 10000, 1)).toBe(3);
    expect(pageRun([], 0, 300, 1)).toBe(0);
  });

  it("matches the distance of the run it reports", () => {
    const uneven = slides([100, 250, 50, 300, 120]);
    const count = pageRun(uneven, 0, 300, 1);
    expect(runDistance(uneven, 0, count, 1)).toBe(350);
  });
});

describe("buildMetrics", () => {
  const elements = [0, 1, 2].map(() => document.createElement("div"));

  it("measures left to right from the track origin", () => {
    const track = box(20, 300);
    const metrics = buildMetrics(
      track,
      elements,
      [box(20, 100), box(120, 100), box(220, 100)],
      false
    );
    expect(metrics.slides.map((s) => s.start)).toEqual([0, 100, 200]);
    expect(metrics.slides.map((s) => s.size)).toEqual([100, 100, 100]);
    expect(metrics.contentSize).toBe(300);
    expect(metrics.viewportSize).toBe(300);
    expect(metrics.maxSlideSize).toBe(100);
  });

  it("counts horizontal margins in the slide size and the margin box start", () => {
    const track = box(0, 300);
    const metrics = buildMetrics(track, [elements[0]!], [box(10, 100, 10)], false);
    expect(metrics.slides[0]?.size).toBe(120);
    expect(metrics.slides[0]?.start).toBe(0);
    expect(metrics.contentSize).toBe(120);
  });

  it("measures right to left in RTL so the math stays sign free", () => {
    const track = box(0, 300);
    const metrics = buildMetrics(
      track,
      elements,
      [box(200, 100), box(100, 100), box(0, 100)],
      true
    );
    expect(metrics.slides.map((s) => s.start)).toEqual([0, 100, 200]);
    expect(metrics.contentSize).toBe(300);
  });

  it("skips slides with no matching box", () => {
    const metrics = buildMetrics(box(0, 300), elements, [box(0, 100)], false);
    expect(metrics.slides).toHaveLength(1);
  });

  it("folds the track's flex gap into each slide size", () => {
    const track = box(0, 200);
    const metrics = buildMetrics(
      track,
      elements,
      [box(0, 100), box(110, 150), box(270, 80)],
      false,
      10
    );
    expect(metrics.slides.map((s) => s.size)).toEqual([110, 160, 90]);
    expect(metrics.slides.map((s) => s.start)).toEqual([0, 110, 270]);
    expect(metrics.contentSize).toBe(360);
    expect(metrics.maxSlideSize).toBe(160);
    // the load bearing invariant: each start is the cumsum of prior sizes
    let run = 0;
    for (const slide of metrics.slides) {
      expect(slide.start).toBe(run);
      run += slide.size;
    }
  });

  it("keeps gap and margins additive, and matches in RTL", () => {
    const withMargin = buildMetrics(
      box(0, 300),
      [elements[0]!],
      [box(10, 100, 10)],
      false,
      10
    );
    expect(withMargin.slides[0]?.size).toBe(130);

    const rtl = buildMetrics(
      box(0, 200),
      elements,
      [box(100, 100), box(-60, 150), box(-150, 80)],
      true,
      10
    );
    expect(rtl.slides.map((s) => s.start)).toEqual([0, 110, 270]);
    expect(rtl.contentSize).toBe(360);
  });
});

describe("headAt boundary tolerance", () => {
  const S = slides([100, 100, 100, 100, 100]);

  it("promotes an offset a few ulps below a boundary to that boundary", () => {
    expect(headAt(S, 299.9999999)).toEqual({ index: 3, fraction: 0 });
  });

  it("promotes across the wrap seam to slide zero", () => {
    expect(headAt(S, 499.9999999)).toEqual({ index: 0, fraction: 0 });
  });

  it("leaves offsets outside the tolerance alone", () => {
    const head = headAt(S, 299.4);
    expect(head.index).toBe(2);
    expect(head.fraction).toBeCloseTo(0.994);
  });
});

describe("deltaToBoundary", () => {
  it("moves forward and backward to a wrapped boundary", () => {
    expect(deltaToBoundary(0, 100, 1, 500)).toBe(100);
    expect(deltaToBoundary(0, 400, -1, 500)).toBe(-100);
  });

  it("maps a zero or sub-epsilon residue to a full revolution", () => {
    expect(deltaToBoundary(0, 0, 1, 500)).toBe(500);
    expect(deltaToBoundary(299.9999999, 300, 1, 500)).toBeCloseTo(500, 5);
    expect(deltaToBoundary(100.3, 100, -1, 500)).toBeCloseTo(-500.3);
  });
});

describe("readGap", () => {
  it("resolves px, percent, unset and garbage", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    expect(readGap(el, 300)).toBe(0); // unset computes to "normal"

    el.style.columnGap = "16px";
    expect(readGap(el, 300)).toBe(16);

    el.style.columnGap = "5%";
    expect(readGap(el, 300)).toBe(15);

    el.remove();
  });
});
