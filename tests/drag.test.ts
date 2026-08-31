import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Multislider } from "../src/multislider";
import { installRaf, makeMarkup, resetLayout, useLayout } from "./helpers";

type Raf = ReturnType<typeof installRaf>;

let raf: Raf;
let slider: Multislider | null = null;

/** jsdom has no PointerEvent, so stand in a MouseEvent carrying a pointerId. */
function pointer(type: string, clientX: number, timeStamp = 0): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  return event;
}

beforeEach(() => {
  raf = installRaf();
  useLayout({ viewport: 300, sizes: [100, 100, 100, 100, 100] });
});

afterEach(() => {
  slider?.destroy();
  slider = null;
  raf.restore();
  resetLayout();
  document.body.replaceChildren();
});

function setup(options = {}) {
  const root = makeMarkup(5);
  slider = new Multislider(root, { interval: 0, duration: 0, ...options });
  const track = root.querySelector<HTMLElement>(".ms-track")!;
  return { root, track };
}

describe("drag", () => {
  it("moves the offset against the pointer and pauses while held", () => {
    const { root, track } = setup();
    track.dispatchEvent(pointer("pointerdown", 200, 0));
    expect(slider!.paused).toBe(true);

    window.dispatchEvent(pointer("pointermove", 150, 16));
    expect(track.style.transform).toBe("translate3d(-50px, 0, 0)");

    window.dispatchEvent(pointer("pointerup", 150, 32));
    expect(root.contains(track)).toBe(true);
  });

  it("snaps to the nearest slide boundary after release", () => {
    const { track } = setup();
    track.dispatchEvent(pointer("pointerdown", 200, 0));
    window.dispatchEvent(pointer("pointermove", 140, 16));
    // no further movement, so the release carries no velocity
    window.dispatchEvent(pointer("pointermove", 140, 200));
    window.dispatchEvent(pointer("pointerup", 140, 400));
    expect(track.style.transform).toBe("translate3d(-100px, 0, 0)");
    expect(slider!.paused).toBe(false);
  });

  it("snaps back when the drag stays under half a slide", () => {
    const { track } = setup();
    track.dispatchEvent(pointer("pointerdown", 200, 0));
    window.dispatchEvent(pointer("pointermove", 170, 16));
    window.dispatchEvent(pointer("pointermove", 170, 200));
    window.dispatchEvent(pointer("pointerup", 170, 400));
    expect(track.style.transform).toBe("translate3d(0px, 0, 0)");
  });

  it("ignores movement under the drag threshold and lets the click through", () => {
    const { root, track } = setup();
    let clicked = 0;
    root.addEventListener("click", () => {
      clicked += 1;
    });

    track.dispatchEvent(pointer("pointerdown", 200, 0));
    window.dispatchEvent(pointer("pointermove", 198, 16));
    window.dispatchEvent(pointer("pointerup", 198, 32));
    expect(track.style.transform).toBe("translate3d(0px, 0, 0)");

    track.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicked).toBe(1);
  });

  it("swallows the click that follows a real drag", () => {
    const { root, track } = setup();
    let clicked = 0;
    root.addEventListener("click", () => {
      clicked += 1;
    });

    track.dispatchEvent(pointer("pointerdown", 200, 0));
    window.dispatchEvent(pointer("pointermove", 120, 16));
    window.dispatchEvent(pointer("pointermove", 120, 200));
    window.dispatchEvent(pointer("pointerup", 120, 400));

    track.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicked).toBe(0);

    track.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicked).toBe(1);
  });

  it("does nothing when draggable is off", () => {
    const { track } = setup({ draggable: false });
    track.dispatchEvent(pointer("pointerdown", 200, 0));
    window.dispatchEvent(pointer("pointermove", 100, 16));
    expect(track.style.transform).toBe("translate3d(0px, 0, 0)");
    expect(slider!.paused).toBe(false);
  });

  it("cancels native dragstart and selectstart while a pointer is down", () => {
    const { track } = setup();
    track.dispatchEvent(pointer("pointerdown", 200, 0));

    const drag = new Event("dragstart", { bubbles: true, cancelable: true });
    track.dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(true);

    // below the 4px threshold the press must still be protected
    window.dispatchEvent(pointer("pointermove", 198, 16));
    const select = new Event("selectstart", { bubbles: true, cancelable: true });
    track.dispatchEvent(select);
    expect(select.defaultPrevented).toBe(true);
  });

  it("lets dragstart and selectstart through when no gesture is active", () => {
    const { track } = setup();
    const drag = new Event("dragstart", { bubbles: true, cancelable: true });
    track.dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(false);

    track.dispatchEvent(pointer("pointerdown", 200, 0));
    window.dispatchEvent(pointer("pointerup", 200, 32));
    const select = new Event("selectstart", { bubbles: true, cancelable: true });
    track.dispatchEvent(select);
    expect(select.defaultPrevented).toBe(false);
  });

  it("does not intercept dragstart when draggable is off", () => {
    const { track } = setup({ draggable: false });
    track.dispatchEvent(pointer("pointerdown", 200, 0));
    const drag = new Event("dragstart", { bubbles: true, cancelable: true });
    track.dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(false);
  });

  it("stops intercepting dragstart after destroy", () => {
    const { track } = setup();
    slider!.destroy();
    slider = null;
    track.dispatchEvent(pointer("pointerdown", 200, 0));
    const drag = new Event("dragstart", { bubbles: true, cancelable: true });
    track.dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(false);
  });

  it("lands the next step on a boundary even from live momentum", () => {
    const { track } = setup();
    track.dispatchEvent(pointer("pointerdown", 200, 8));
    window.dispatchEvent(pointer("pointermove", 160, 24)); // velocity 2.5 px/ms
    window.dispatchEvent(pointer("pointerup", 160, 40));

    raf.step(16); // seeds the momentum clock
    raf.step(16); // 2.5 px/ms * 16ms
    expect(track.style.transform).toBe("translate3d(-80px, 0, 0)");

    slider!.next();
    expect(track.style.transform).toBe("translate3d(-100px, 0, 0)");
    raf.run(5); // no zombie momentum frames
    expect(track.style.transform).toBe("translate3d(-100px, 0, 0)");
  });

  it("does not fling when the finger held still before release", () => {
    const { track } = setup();
    track.dispatchEvent(pointer("pointerdown", 200, 8));
    window.dispatchEvent(pointer("pointermove", 120, 24)); // fast: velocity 5 px/ms
    window.dispatchEvent(pointer("pointerup", 120, 224)); // 200ms hold: stale

    // zero velocity resolves synchronously into the snap
    expect(track.style.transform).toBe("translate3d(-100px, 0, 0)");
    expect(raf.pending).toBe(0);
  });

  it("keeps the fling when the release follows the movement promptly", () => {
    const { track } = setup();
    track.dispatchEvent(pointer("pointerdown", 200, 8));
    window.dispatchEvent(pointer("pointermove", 120, 24));
    window.dispatchEvent(pointer("pointerup", 120, 40)); // 16ms gap: fresh

    expect(track.style.transform).toBe("translate3d(-80px, 0, 0)");
    raf.step(16); // seeds the momentum clock
    raf.step(16);
    expect(track.style.transform).toBe("translate3d(-160px, 0, 0)");
  });

  it("settles a tap that lands mid tween instead of freezing off-boundary", () => {
    const { root, track } = setup({ duration: 300 });
    let after = 0;
    root.addEventListener("multislider:afterchange", () => {
      after += 1;
    });

    slider!.next();
    raf.step(16); // tween start
    raf.step(150); // halfway: ease(0.5) = 0.5 of 100px
    expect(track.style.transform).toBe("translate3d(-50px, 0, 0)");

    track.dispatchEvent(pointer("pointerdown", 200, 400)); // cancels the tween
    window.dispatchEvent(pointer("pointerup", 200, 416)); // tap, no movement

    raf.step(16);
    raf.step(300); // the settle snap completes forward
    expect(track.style.transform).toBe("translate3d(-100px, 0, 0)");
    // the superseded step fired no afterchange; the next full step does
    expect(after).toBe(0);

    slider!.next();
    raf.step(16);
    raf.step(300);
    expect(track.style.transform).toBe("translate3d(-200px, 0, 0)");
    expect(after).toBe(1);
  });

  it("settles without momentum when the gesture is canceled", () => {
    const { track } = setup();
    track.dispatchEvent(pointer("pointerdown", 200, 0));
    window.dispatchEvent(pointer("pointermove", 140, 16)); // fast move = real velocity
    window.dispatchEvent(pointer("pointercancel", 140, 32));
    // zero velocity: done() ran synchronously and the snap landed at once
    expect(track.style.transform).toBe("translate3d(-100px, 0, 0)");
    expect(slider!.paused).toBe(false);
  });

  it("does not block the next click after pointercancel", () => {
    const { root, track } = setup();
    let clicked = 0;
    root.addEventListener("click", () => {
      clicked += 1;
    });
    track.dispatchEvent(pointer("pointerdown", 200, 0));
    window.dispatchEvent(pointer("pointermove", 120, 16));
    window.dispatchEvent(pointer("pointercancel", 120, 32));
    track.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicked).toBe(1);
  });

  it("drags the other way in RTL", () => {
    useLayout({ viewport: 300, sizes: [100, 100, 100, 100, 100], rtl: true });
    const root = makeMarkup(5);
    slider = new Multislider(root, {
      interval: 0,
      duration: 0,
      direction: "rtl",
    });
    const track = root.querySelector<HTMLElement>(".ms-track")!;

    track.dispatchEvent(pointer("pointerdown", 100, 0));
    window.dispatchEvent(pointer("pointermove", 150, 16));
    expect(track.style.transform).toBe("translate3d(50px, 0, 0)");
  });
});
