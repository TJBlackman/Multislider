# Changelog

## 2.0.0 (2026-08-31)

First stable release of the v2 rewrite: TypeScript, zero dependencies, ESM plus
an IIFE build. Everything from `2.0.0-beta.0` plus the hardening pass below.

### Fixed

- Keyboard focus pauses under its own `"focus"` reason instead of sharing
  `"hover"`, so a stray pointer movement can no longer resume autoplay while a
  keyboard user is inside the slider. Focus pause also applies with
  `hoverPause: false`, and a focused element removed without a `focusout` no
  longer wedges the pause.
- Arrow keys follow the visual direction in RTL (ArrowLeft advances), and
  presses with ctrl/alt/meta/shift held or an already handled event are left to
  the browser.
- Dragging a carousel of images or links no longer triggers native HTML5 drag
  or text selection mid gesture.
- `pointercancel` (the OS taking over for a scroll or pinch) settles without a
  momentum fling and no longer swallows the next click.
- A release more than 80ms after the last pointer movement no longer flings
  with the stale velocity.
- A resize or breakpoint change mid animation no longer replays the old
  geometry: in-flight tweens settle first, and an active drag stays continuous
  under the finger.
- Hiding the container (tab panel, accordion) and showing it again keeps the
  same slide leading instead of teleporting to the last slide, and zero-size
  content stops firing change events or spinning the marquee loop.
- Steps land exactly on measured slide boundaries with half-pixel tolerance,
  so interrupted momentum, marquee remnants, and float error can no longer
  accumulate into permanent misalignment. `setMode("step")` snaps to a
  boundary. A tap landing mid tween settles instead of freezing off-boundary.
- Ultrawide and 4K viewports clone as many slide sets as looping needs
  (previously exactly one set), capped at 600 slide elements. When even the
  cap cannot cover the viewport, the clones are removed and clamped mode runs
  on the originals with honest events: steps stop silently at the hard edges
  and autoplay rewinds to the start as a single backward transition.
- A marquee pinned by a resize that disables looping is cancelled instead of
  spinning forever.
- `direction: "auto"` trusts computed style over ancestor `dir` attributes.
- Node `require()` and CJS bundler contexts resolve the ESM build instead of
  crashing on the IIFE; bare unpkg/jsdelivr URLs serve the script-tag build.

### Added

- CSS `gap` on `.ms-track` is fully supported and folds into the wrap math,
  including percent gaps and RTL.
- Slides get `role="group"`, `aria-roledescription="slide"`, and positional
  labels; the track manages `aria-live` (`"off"` while auto-rotating,
  `"polite"` otherwise) per the WAI-ARIA carousel pattern.
- `@tjblackman/multislider/global` subpath for the IIFE build, typed via
  `dist/global.d.ts` (also types `window.Multislider`).

### Changed

- `PauseReason` gains `"focus"`. Exhaustive switches over `detail.reasons`
  need the new member.
- `multislider:afterchange` fires only for steps that complete; a step
  superseded by a pointer grab, `setMode()`, or `destroy()` fires no
  afterchange (matching Embla/Flickity/Swiper supersede behavior).
- In clamped mode, event details report what actually happened; `count` can be
  0 for a partial step.

### Browser support

Runs from Chrome/Edge 84, Firefox 90, Safari/iOS 15.0 (limiting feature:
private class methods). Full behavior (`inert` on cloned slides) from
Chrome/Edge 102, Firefox 112, Safari 15.5. The host page needs only flexbox
and 2D transforms.

## 2.0.0-beta.0

v2 rewrite: TypeScript, zero dependencies, ESM + IIFE, new engine with a
single wrapped offset, marquee mode, pointer dragging with momentum, pause
reason set, RTL, reduced motion support. jQuery removed; v1 markup hooks
(`.MS-content`, `.MS-left`, `.MS-right`) still recognized.
