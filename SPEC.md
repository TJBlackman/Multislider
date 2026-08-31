# Multislider v2 specification

This is the binding contract for the v2 rewrite. The library ships as `@tjblackman/multislider`. Zero runtime dependencies, TypeScript source, ESM output plus one IIFE build for script tag users (`window.Multislider` is the class). Modern evergreen browsers only.

The v1 jQuery source is preserved on the `v1` branch and the `v1.0.0` tag for reference.

## Identity

Multislider shows N slides at once where N is controlled entirely by the user's CSS (a slide with `width: 20%` means 5 visible slides; media queries change the count responsively). The library never sets slide widths and has no `slidesVisible` option. Bring your own markup and CSS.

## Markup contract

```html
<div id="mySlider">
  <div class="MS-content">      <!-- viewport -->
    <div class="item">...</div> <!-- slides: the element children of the viewport -->
    <div class="item">...</div>
  </div>
  <button data-ms="prev">...</button>
  <button data-ms="next">...</button>
</div>
```

- Viewport: first descendant matching `[data-ms="viewport"]`, `.ms-viewport`, or legacy `.MS-content`.
- Slides: the element children of the viewport at init time. Any HTML.
- Buttons: descendants matching `[data-ms="prev"]` / `[data-ms="next"]`, or legacy `.MS-left` / `.MS-right`. Optional.
- At init the library creates a track element (`div.ms-track`) inside the viewport and moves the slides into it exactly once. `destroy()` restores the original DOM.
- The library enforces critical styles inline so no CSS import is required: viewport gets `overflow: hidden`; track gets `display: flex; width: 100%; will-change: transform`; slides get `flex: 0 0 auto`. Percentage slide widths resolve against the track, whose width equals the viewport content box, so v1 style CSS keeps working.

## Constructor

```ts
new Multislider(target: string | HTMLElement, options?: MultisliderOptions)
```

Throws a descriptive `Error` if the target or viewport cannot be found, or if the target is already initialized (store instance on a WeakMap or data attribute guard). Multiple independent instances on one page must work.

## Options (all optional)

| Option | Type | Default | Meaning |
|---|---|---|---|
| `mode` | `"step" \| "marquee"` | `"step"` | Stepped slideshow vs constant speed marquee scrolling left forever (linear). |
| `advanceBy` | `"one" \| "page"` | `"one"` | What autoplay and the prev/next buttons move: one slide, or a full viewport worth. |
| `interval` | `number` | `2000` | ms between autoplay steps in step mode. `0` disables autoplay. |
| `duration` | `number` | `500` | ms per step tween. |
| `speed` | `number` | `60` | Marquee speed in px/second. |
| `hoverPause` | `boolean` | `true` | Pause while pointer is over the viewport. In marquee mode, pauses mid animation and resumes seamlessly. |
| `pauseAbove` | `number \| null` | `null` | Pause autoplay/marquee when viewport width in px is above this (matchMedia, not resize handlers). |
| `pauseBelow` | `number \| null` | `null` | Same, below. |
| `draggable` | `boolean` | `true` | Pointer/touch drag with momentum and snap to nearest slide boundary. |
| `respectReducedMotion` | `boolean` | `true` | Under `prefers-reduced-motion: reduce`: step duration becomes 0, autoplay is disabled, marquee is paused. |
| `direction` | `"auto" \| "ltr" \| "rtl"` | `"auto"` | `auto` reads computed `direction` of the root. RTL flips all motion via a single sign. |

## Methods

| Method | Behavior |
|---|---|
| `next(count = 1)` / `prev(count = 1)` | Step by `count` slides. Works while paused (a paused slider still responds to explicit calls and button clicks). Resets the autoplay timer. |
| `nextPage()` / `prevPage()` | Step by the smallest run of consecutive slide widths that is >= the viewport width (correct even with uneven slide widths). |
| `pause()` / `play()` | Adds/removes the `"api"` pause reason. `play()` does not start autoplay if `interval: 0`. |
| `refresh()` | Re-measure slides and viewport (call after content changes). |
| `setMode(mode)` | Switch between `"step"` and `"marquee"` at runtime. |
| `destroy()` | Remove all listeners, observers, rAF loops, and injected DOM/styles; restore original markup. Instance is dead afterwards. |
| `paused` (getter) | `true` if any pause reason is active. |
| `element` (getter) | The root element. |

Prev/next buttons do exactly what `prev()`/`next()` do when `advanceBy: "one"`, or `prevPage()`/`nextPage()` when `advanceBy: "page"`.

## Events

Native `CustomEvent`s dispatched on the root element, bubbling:

- `multislider:beforechange` — cancelable; `preventDefault()` blocks the step. `detail: { from, to, direction, count }` where `from`/`to` are logical head slide indices and `direction` is `1 | -1`.
- `multislider:afterchange` — same detail, fired once per committed step (never per frame; marquee mode fires neither).
- `multislider:pause` / `multislider:play` — `detail: { reasons: string[] }`, fired when the pause reason set becomes nonempty / empty.

## Engine architecture (binding)

One engine serves step, page, marquee, and drag:

- State: `slides[i] = { el, size, start }` (size = outer width including padding/border/margin plus the track's flex column gap; start = layout offset from track origin), `contentSize = sum(sizes)`, which equals the true wrap period with one gap per joint including the seam, and one scalar `offset` normalized into `[0, contentSize)`.
- Render each frame: `track.style.transform = translate3d(-offset px, 0, 0)` (sign flipped for RTL). For each slide compute `p = start - offset`; if the slide is fully left of the viewport give it its own `translateX(contentSize)`, if fully right give `translateX(-contentSize)`, otherwise clear. Only write styles when the wrap state changes. No cloning, no DOM reordering, ever (exception below).
- `next`: tween `offset` by the head slide's size. `prev`: by the previous slide's size. Page: by the computed run. Marquee: `offset += speed * dt` inside the rAF loop. Drag: `offset = offsetAtPointerDown - dx`, then momentum and snap.
- Tween easing: ease in out cubic; linear for marquee.
- Pause is a `Set<PauseReason>` with reasons `"api" | "hover" | "focus" | "media" | "hidden" | "drag" | "reduced-motion"`. Frames are only scheduled while the set is empty (explicit `next()`/`prev()`/drag override pausing for their own animation, mirroring v1's overRidePause). Resume reseeds the rAF timestamp.
- `document.visibilitychange` adds/removes `"hidden"`.
- ResizeObserver on viewport and track, coalesced to one rAF; after remeasure, re-derive `offset` from the logical head index plus fraction so the same slide stays leading across breakpoint changes.
- Measurement: `slideRect.left - trackRect.left` with wrap transforms accounted for (or zeroed in the same frame). Never `offsetWidth`. Never accumulate `start` by summing; recompute from rects each measure pass. The track's computed `columnGap` is read each pass (percentages resolve against the track width) and folded into every slide's outer size, so user CSS `gap` on `.ms-track` is fully supported. A gap-only style change does not resize the track, so it needs `refresh()`, like margin-only changes.
- Loop guard: infinite wrap requires `contentSize >= viewportSize + maxSlideSize` (half pixel tolerance). If violated at measure time, clone whole slide sets (the only cloning case; clones get `aria-hidden="true"`, `inert`, and `data-ms-clone`): compute the needed set count arithmetically from the first measurement, append, and verify with a remeasure (bounded corrective passes cover CSS that resizes clones). Total slide elements are capped at 600. If the guard still fails at the cap, or content measures zero, remove the clones, disable looping and clamp, with a one time console warning.
- Clamped mode (loop guard failed): the offset clamps to `[0, max(0, contentSize - viewportSize)]`. `next()`/`prev()` at a hard edge do nothing and fire no events; a step that overshoots clamps to the edge and events report the actual landing index and indices crossed (`count` can be 0 for a partial step). Autoplay at the far edge tweens back to offset 0 as a single transition (`direction: -1`) and keeps cycling; when nothing can move, autoplay ticks are silent. Marquee does not run in clamped mode. Snap and momentum targets clamp to the same range.
- Focus: on `focusin` inside the track, jump `offset` (no tween) so the focused slide is fully visible.

## Accessibility

- Root gets `aria-roledescription="carousel"` and `role="region"` (plus `aria-label="slideshow"` only if the user provided no label).
- Slides get `role="group"`, `aria-roledescription="slide"`, and a positional `aria-label` (`"n of N"`) unless already labelled. The track carries `aria-live`: `"off"` while auto-rotating, `"polite"` while paused or when autoplay is disabled.
- Buttons without accessible names get `aria-label="Previous slide"` / `"Next slide"`.
- Autoplay pauses on `focusin` within the root (its own `"focus"` reason, independent of hover, and active even with `hoverPause: false`) and resumes on `focusout`.
- Keyboard: ArrowLeft/ArrowRight trigger prev/next when focus is on the root or the buttons. The arrow points at the edge new content enters from, so RTL flips the mapping (ArrowLeft advances). Events with a modifier key held or already `defaultPrevented` are ignored.

## File layout

```
src/
  index.ts        # exports Multislider class + types
  multislider.ts  # public class: options, DOM wiring, listeners, lifecycle
  engine.ts       # offset state, rAF loop, tween, wrap math (pure where possible)
  measure.ts      # measurement + page run computation (pure functions, unit testable)
  types.ts
tests/
  *.test.ts       # vitest, jsdom environment
site/             # docs website (Vite vanilla, no frameworks)
```

Unit tests must cover the pure math: offset normalization/wrapping, wrap state per slide, page run computation with uneven widths, RTL sign handling, and option normalization. DOM lifecycle tests (init/destroy restores markup, event firing) run in jsdom with mocked rects.

## v1 to v2 migration mapping (for docs)

| v1 | v2 |
|---|---|
| `$('#s').multislider({...})` | `new Multislider('#s', {...})` |
| `continuous: true` | `mode: "marquee"` |
| `slideAll: true` | `advanceBy: "page"` |
| `duration` as marquee speed | `speed` (px/sec) |
| `.multislider('pause'/'unPause')` | `.pause()` / `.play()` |
| `.multislider('next'/'prev')` | `.next()` / `.prev()` |
| `.multislider('nextAll'/'prevAll')` | `.nextPage()` / `.prevPage()` |
| `.multislider('continuous')` | `.setMode("marquee")` |
| `ms.before.animate` / `ms.after.animate` | `multislider:beforechange` / `multislider:afterchange` |
| Required CSS (`white-space: nowrap`, `inline-block`, ...) | Gone; library enforces its own critical styles. Users only set slide widths. |
| jQuery | Gone. |
