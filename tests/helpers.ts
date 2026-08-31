import type { Metrics, SlideMetric } from "../src/types";

export interface LayoutConfig {
  /** Width of the track, which the library treats as the viewport width. */
  viewport: number;
  /** Sizes of the original slides. Duplicates repeat the same cycle. */
  sizes: number[];
  /** Flex column gap of the track. Injected through the computed style seam. */
  gap?: number;
  rtl?: boolean;
}

let layout: LayoutConfig | null = null;
const nativeRect = Element.prototype.getBoundingClientRect;
const nativeGetComputedStyle = globalThis.getComputedStyle;

function rect(left: number, width: number): DOMRect {
  const value = {
    x: left,
    y: 0,
    left,
    right: left + width,
    top: 0,
    bottom: 0,
    width,
    height: 0,
  };
  return { ...value, toJSON: () => value } as DOMRect;
}

function sizeAt(config: LayoutConfig, index: number): number {
  const count = config.sizes.length;
  if (count === 0) return 0;
  return config.sizes[index % count] ?? 0;
}

function fakeRect(this: Element): DOMRect {
  const config = layout;
  if (!config) return rect(0, 0);
  const element = this as HTMLElement;

  if (element.classList.contains("ms-track")) return rect(0, config.viewport);

  const parent = element.parentElement;
  if (parent && parent.classList.contains("ms-track")) {
    const index = Array.prototype.indexOf.call(parent.children, element);
    const gap = config.gap ?? 0;
    let run = 0;
    for (let i = 0; i < index; i++) run += sizeAt(config, i) + gap;
    const size = sizeAt(config, index);
    return config.rtl
      ? rect(config.viewport - run - size, size)
      : rect(run, size);
  }

  return rect(0, 0);
}

// jsdom does not expand the `gap` shorthand into columnGap, so gap is injected
// here instead of via inline styles. Real browsers do expand it.
function fakeGetComputedStyle(
  element: Element,
  pseudo?: string | null
): CSSStyleDeclaration {
  const native = nativeGetComputedStyle(element, pseudo);
  const config = layout;
  if (!config?.gap || !(element as HTMLElement).classList?.contains("ms-track")) {
    return native;
  }
  return new Proxy(native, {
    get(target, prop) {
      if (prop === "columnGap") return `${config.gap}px`;
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function useLayout(config: LayoutConfig): void {
  layout = config;
  Element.prototype.getBoundingClientRect = fakeRect;
  globalThis.getComputedStyle = fakeGetComputedStyle;
}

export function resetLayout(): void {
  layout = null;
  Element.prototype.getBoundingClientRect = nativeRect;
  globalThis.getComputedStyle = nativeGetComputedStyle;
}

/** Deterministic frame clock so tween, marquee and momentum can be stepped by hand. */
export function installRaf() {
  const callbacks = new Map<number, FrameRequestCallback>();
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let handle = 0;
  let now = 0;

  globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    handle += 1;
    callbacks.set(handle, callback);
    return handle;
  };
  globalThis.cancelAnimationFrame = (id: number): void => {
    callbacks.delete(id);
  };

  return {
    step(ms = 16): void {
      now += ms;
      const due = Array.from(callbacks.values());
      callbacks.clear();
      for (const callback of due) callback(now);
    },
    run(frames: number, ms = 16): void {
      for (let i = 0; i < frames; i++) this.step(ms);
    },
    get pending(): number {
      return callbacks.size;
    },
    restore(): void {
      globalThis.requestAnimationFrame = originalRequest;
      globalThis.cancelAnimationFrame = originalCancel;
    },
  };
}

/** Metrics over detached elements, for engine tests that need no real document layout. */
export function makeMetrics(sizes: number[], viewportSize: number): Metrics {
  const slides: SlideMetric[] = [];
  let start = 0;
  let maxSlideSize = 0;
  for (const size of sizes) {
    slides.push({ el: document.createElement("div"), size, start });
    start += size;
    if (size > maxSlideSize) maxSlideSize = size;
  }
  return { slides, contentSize: start, viewportSize, maxSlideSize };
}

export function makeMarkup(slideCount: number, options: { viewportClass?: string } = {}) {
  const root = document.createElement("div");
  root.id = "slider";
  const items = Array.from(
    { length: slideCount },
    (_, i) => `<div class="item">slide ${i}</div>`
  ).join("");
  root.innerHTML =
    `<div class="${options.viewportClass ?? "MS-content"}">${items}</div>` +
    `<button data-ms="prev"></button>` +
    `<button data-ms="next"></button>`;
  document.body.appendChild(root);
  return root;
}
