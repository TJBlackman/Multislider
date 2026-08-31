import { describe, expect, it } from "vitest";
import { normalizeOptions } from "../src/measure";
import type { MultisliderOptions } from "../src/types";

describe("normalizeOptions", () => {
  it("fills in every default", () => {
    expect(normalizeOptions()).toEqual({
      mode: "step",
      advanceBy: "one",
      interval: 2000,
      duration: 500,
      speed: 60,
      hoverPause: true,
      pauseAbove: null,
      pauseBelow: null,
      draggable: true,
      respectReducedMotion: true,
      direction: "auto",
      maxClones: 600,
    });
  });

  it("keeps valid values", () => {
    const options: MultisliderOptions = {
      mode: "marquee",
      advanceBy: "page",
      interval: 0,
      duration: 250,
      speed: 120,
      hoverPause: false,
      pauseAbove: 1200,
      pauseBelow: 640,
      draggable: false,
      respectReducedMotion: false,
      direction: "rtl",
      maxClones: 12,
    };
    expect(normalizeOptions(options)).toEqual(options);
  });

  it("normalizes maxClones to a whole non-negative count", () => {
    expect(normalizeOptions({ maxClones: 0 }).maxClones).toBe(0);
    expect(normalizeOptions({ maxClones: 7.9 }).maxClones).toBe(7);
    expect(normalizeOptions({ maxClones: -5 }).maxClones).toBe(0);
    expect(
      normalizeOptions({ maxClones: Number.NaN }).maxClones
    ).toBe(600);
  });

  it("falls back to defaults for unknown enum values", () => {
    const messy = {
      mode: "continuous",
      advanceBy: "all",
      direction: "sideways",
    } as unknown as MultisliderOptions;
    const result = normalizeOptions(messy);
    expect(result.mode).toBe("step");
    expect(result.advanceBy).toBe("one");
    expect(result.direction).toBe("auto");
  });

  it("clamps negative timings to zero and rejects non numbers", () => {
    const messy = {
      interval: -500,
      duration: -1,
      speed: -60,
    } as MultisliderOptions;
    expect(normalizeOptions(messy)).toMatchObject({
      interval: 0,
      duration: 0,
      speed: 0,
    });

    const broken = {
      interval: "fast",
      duration: Number.NaN,
      speed: Number.POSITIVE_INFINITY,
    } as unknown as MultisliderOptions;
    expect(normalizeOptions(broken)).toMatchObject({
      interval: 2000,
      duration: 500,
      speed: 60,
    });
  });

  it("treats a non numeric breakpoint as no breakpoint", () => {
    const messy = { pauseAbove: "1200px", pauseBelow: null } as unknown as MultisliderOptions;
    const result = normalizeOptions(messy);
    expect(result.pauseAbove).toBeNull();
    expect(result.pauseBelow).toBeNull();
  });

  it("keeps explicit false for booleans", () => {
    const result = normalizeOptions({ hoverPause: false, draggable: false });
    expect(result.hoverPause).toBe(false);
    expect(result.draggable).toBe(false);
  });
});
