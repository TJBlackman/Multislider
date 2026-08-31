export type Mode = "step" | "marquee";

export type AdvanceBy = "one" | "page";

export type DirectionOption = "auto" | "ltr" | "rtl";

export type PauseReason =
  | "api"
  | "hover"
  | "focus"
  | "media"
  | "hidden"
  | "drag"
  | "reduced-motion";

export interface MultisliderOptions {
  mode?: Mode;
  advanceBy?: AdvanceBy;
  interval?: number;
  duration?: number;
  speed?: number;
  hoverPause?: boolean;
  pauseAbove?: number | null;
  pauseBelow?: number | null;
  draggable?: boolean;
  respectReducedMotion?: boolean;
  direction?: DirectionOption;
  /**
   * Cap on cloned slide elements added to satisfy the loop guard.
   * 0 disables cloning entirely; the guard then falls back to clamped mode.
   */
  maxClones?: number;
}

export interface ResolvedOptions {
  mode: Mode;
  advanceBy: AdvanceBy;
  interval: number;
  duration: number;
  speed: number;
  hoverPause: boolean;
  pauseAbove: number | null;
  pauseBelow: number | null;
  draggable: boolean;
  respectReducedMotion: boolean;
  direction: DirectionOption;
  maxClones: number;
}

export interface ChangeDetail {
  from: number;
  to: number;
  direction: 1 | -1;
  count: number;
}

export interface PauseDetail {
  reasons: PauseReason[];
}

export interface SettleDetail {
  /** Logical index of the head slide at rest. */
  index: number;
}

/** Geometry of one box in physical (screen) coordinates. */
export interface BoxGeometry {
  left: number;
  right: number;
  width: number;
  marginLeft: number;
  marginRight: number;
}

export interface SlideMetric {
  el: HTMLElement;
  /** Outer size: border box plus horizontal margins. */
  size: number;
  /** Logical offset of the slide's margin box start from the track origin. */
  start: number;
}

export interface Metrics {
  slides: SlideMetric[];
  contentSize: number;
  viewportSize: number;
  maxSlideSize: number;
}

/** -1 wraps a slide one content length backwards, 1 wraps it forwards. */
export type WrapState = -1 | 0 | 1;

export interface MultisliderEventMap {
  "multislider:beforechange": CustomEvent<ChangeDetail>;
  "multislider:afterchange": CustomEvent<ChangeDetail>;
  "multislider:settle": CustomEvent<SettleDetail>;
  "multislider:pause": CustomEvent<PauseDetail>;
  "multislider:play": CustomEvent<PauseDetail>;
}

declare global {
  interface HTMLElementEventMap extends MultisliderEventMap {}
}
