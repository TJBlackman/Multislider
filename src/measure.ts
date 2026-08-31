import type {
  BoxGeometry,
  Metrics,
  MultisliderOptions,
  ResolvedOptions,
  SlideMetric,
  WrapState,
} from "./types";

export const EMPTY_METRICS: Metrics = {
  slides: [],
  contentSize: 0,
  viewportSize: 0,
  maxSlideSize: 0,
};

/** The one place the library touches real layout. Tests replace it or the rects it reads. */
export function readBox(el: HTMLElement): BoxGeometry {
  const rect = el.getBoundingClientRect();
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return {
    left: rect.left,
    right: rect.right,
    width: rect.width,
    marginLeft: style ? parseFloat(style.marginLeft) || 0 : 0,
    marginRight: style ? parseFloat(style.marginRight) || 0 : 0,
  };
}

/** Flex column gap of the track in px. "normal" and unset resolve to 0. */
export function readGap(el: HTMLElement, trackWidth: number): number {
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (!style) return 0;
  const raw = style.columnGap;
  const value = parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return raw.trim().endsWith("%") ? (value / 100) * trackWidth : value;
}

/**
 * Slide positions come from rect differences against the track, never from summing sizes,
 * so a wrong measurement cannot accumulate. Both rects carry the track's own transform,
 * which cancels in the subtraction. Per slide wrap transforms do not cancel, so the caller
 * clears them before reading.
 *
 * The track's flex gap folds into each slide's outer size, like a trailing
 * margin, so contentSize stays the true wrap period (one gap per joint,
 * including the seam) and every downstream function works unchanged.
 */
export function buildMetrics(
  track: BoxGeometry,
  slides: readonly HTMLElement[],
  boxes: readonly BoxGeometry[],
  rtl: boolean,
  gap = 0
): Metrics {
  const out: SlideMetric[] = [];
  let contentSize = 0;
  let maxSlideSize = 0;

  for (let i = 0; i < slides.length; i++) {
    const el = slides[i];
    const box = boxes[i];
    if (!el || !box) continue;
    const size = box.width + box.marginLeft + box.marginRight + gap;
    const start = rtl
      ? track.right - box.right - box.marginRight
      : box.left - track.left - box.marginLeft;
    out.push({ el, size, start });
    contentSize += size;
    if (size > maxSlideSize) maxSlideSize = size;
  }

  return { slides: out, contentSize, viewportSize: track.width, maxSlideSize };
}

/** Wrap a scalar into [0, contentSize). */
export function normalizeOffset(offset: number, contentSize: number): number {
  if (!(contentSize > 0) || !Number.isFinite(offset)) return 0;
  const wrapped = offset % contentSize;
  return wrapped < 0 ? wrapped + contentSize : wrapped;
}

export function modIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  const wrapped = index % length;
  return wrapped < 0 ? wrapped + length : wrapped;
}

/** Where a slide sits relative to the viewport start, wrapped into [0, contentSize). */
export function wrappedPosition(
  start: number,
  offset: number,
  contentSize: number
): number {
  return normalizeOffset(start - offset, contentSize);
}

export function wrapState(
  start: number,
  size: number,
  offset: number,
  contentSize: number,
  viewportSize: number
): WrapState {
  const p = start - offset;
  if (p + size <= 0) return 1;
  if (p >= viewportSize) return -1;
  return 0;
}

/** The slide covering the viewport start, plus how far into it the offset sits. */
export function headAt(
  slides: readonly SlideMetric[],
  offset: number
): { index: number; fraction: number } {
  if (slides.length === 0) return { index: 0, fraction: 0 };
  for (let i = slides.length - 1; i >= 0; i--) {
    const slide = slides[i];
    if (!slide) continue;
    if (offset >= slide.start) {
      const raw = slide.size > 0 ? (offset - slide.start) / slide.size : 0;
      return { index: i, fraction: Math.min(Math.max(raw, 0), 0.999999) };
    }
  }
  return { index: 0, fraction: 0 };
}

export function offsetForHead(
  slides: readonly SlideMetric[],
  index: number,
  fraction: number,
  contentSize: number
): number {
  const slide = slides[modIndex(index, slides.length)];
  if (!slide) return 0;
  return normalizeOffset(slide.start + slide.size * fraction, contentSize);
}

function runIndex(head: number, step: number, direction: 1 | -1, length: number): number {
  return direction === 1
    ? modIndex(head + step, length)
    : modIndex(head - 1 - step, length);
}

/** Total size of `count` slides starting at the head and walking in `direction`. */
export function runDistance(
  slides: readonly SlideMetric[],
  head: number,
  count: number,
  direction: 1 | -1
): number {
  const n = slides.length;
  if (n === 0) return 0;
  let total = 0;
  for (let step = 0; step < count; step++) {
    total += slides[runIndex(head, step, direction, n)]?.size ?? 0;
  }
  return total;
}

/** Smallest run of consecutive slides whose combined size covers the viewport. */
export function pageRun(
  slides: readonly SlideMetric[],
  head: number,
  viewportSize: number,
  direction: 1 | -1
): number {
  const n = slides.length;
  if (n === 0) return 0;
  let total = 0;
  let count = 0;
  while (count < n) {
    total += slides[runIndex(head, count, direction, n)]?.size ?? 0;
    count++;
    if (total >= viewportSize) break;
  }
  return Math.max(1, count);
}

function toNonNegative(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toBreakpoint(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeOptions(options: MultisliderOptions = {}): ResolvedOptions {
  return {
    mode: options.mode === "marquee" ? "marquee" : "step",
    advanceBy: options.advanceBy === "page" ? "page" : "one",
    interval: toNonNegative(options.interval, 2000),
    duration: toNonNegative(options.duration, 500),
    speed: toNonNegative(options.speed, 60),
    hoverPause: toBoolean(options.hoverPause, true),
    pauseAbove: toBreakpoint(options.pauseAbove),
    pauseBelow: toBreakpoint(options.pauseBelow),
    draggable: toBoolean(options.draggable, true),
    respectReducedMotion: toBoolean(options.respectReducedMotion, true),
    direction:
      options.direction === "ltr" || options.direction === "rtl"
        ? options.direction
        : "auto",
  };
}
