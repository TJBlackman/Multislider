# Multislider

A responsive, dependency free, multi-slide slideshow.

Multislider shows more than one slide at a time, and how many is entirely up to your CSS. A slide
with `width: 20%` gives you five visible slides. A media query that changes it to `50%` gives you
two. The library never sets slide widths and has no `slidesVisible` option.

- Zero runtime dependencies, written in TypeScript
- Step mode and a constant speed marquee mode, switchable at runtime
- Endless looping with no cloning and no DOM reordering
- Pointer and touch dragging with momentum and snapping
- Bring your own markup and CSS

Docs and live examples: [multislider.trevorblackman.dev](https://multislider.trevorblackman.dev)

## Install

```sh
npm i @tjblackman/multislider
```

Or drop in the IIFE build, which puts the class on `window.Multislider`.

```html
<script src="/path/to/multislider.global.js"></script>
```

## Quick start

```html
<div id="mySlider">
  <div class="MS-content">
    <div class="item">Slide 1</div>
    <div class="item">Slide 2</div>
    <div class="item">Slide 3</div>
  </div>
  <button type="button" data-ms="prev">Prev</button>
  <button type="button" data-ms="next">Next</button>
</div>
```

```css
#mySlider .item {
  width: 25%; /* four visible slides */
}

@media (max-width: 768px) {
  #mySlider .item {
    width: 50%; /* two on small screens */
  }
}
```

```js
import { Multislider } from '@tjblackman/multislider';

const slider = new Multislider('#mySlider', {
  interval: 3000,
  duration: 600,
});
```

That is the whole setup. There is no stylesheet to import: the library applies the few styles it
needs (`overflow: hidden` on the viewport, flex on the track, `flex: 0 0 auto` on slides) inline.

For a marquee instead of steps:

```js
new Multislider('#logos', { mode: 'marquee', speed: 40 });
```

## Options, methods, events

Full reference on the [docs site](https://multislider.trevorblackman.dev). The short version:

- Options include `mode`, `advanceBy`, `interval`, `duration`, `speed`, `hoverPause`, `pauseAbove`,
  `pauseBelow`, `draggable`, `respectReducedMotion`, and `direction`.
- Methods include `next()`, `prev()`, `nextPage()`, `prevPage()`, `pause()`, `play()`, `refresh()`,
  `setMode()`, and `destroy()`.
- Events are native bubbling `CustomEvent`s on the root element: `multislider:beforechange`
  (cancelable), `multislider:afterchange`, `multislider:pause`, and `multislider:play`.

## Version 1

v1 was a jQuery plugin. It lives on the [`v1` branch](https://github.com/TJBlackman/Multislider/tree/v1)
and the `v1.0.0` tag, and it is no longer maintained. Your old markup still works in v2, since the
`.MS-content`, `.MS-left`, and `.MS-right` hooks are still recognized. The
[migration table](https://multislider.trevorblackman.dev/#migrating) covers the option and method
renames.

## Browser support

Modern evergreen browsers.

## License

MIT
