import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Multislider } from "../src/multislider";
import { installRaf, makeMarkup, resetLayout, useLayout } from "./helpers";

type Raf = ReturnType<typeof installRaf>;

interface FakeQuery {
  media: string;
  matches: boolean;
  set(value: boolean): void;
}

let raf: Raf;
let slider: Multislider | null = null;
let queries: FakeQuery[] = [];
const nativeMatchMedia = window.matchMedia;

function mockMatchMedia(initial: (media: string) => boolean): void {
  queries = [];
  window.matchMedia = ((media: string) => {
    const listeners = new Set<() => void>();
    const query = {
      media,
      matches: initial(media),
      addEventListener: (_type: string, listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        listeners.delete(listener);
      },
      set(value: boolean) {
        query.matches = value;
        for (const listener of listeners) listener();
      },
    };
    queries.push(query);
    return query as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

function queryFor(fragment: string): FakeQuery {
  const found = queries.find((query) => query.media.includes(fragment));
  if (!found) throw new Error(`no query for ${fragment}`);
  return found;
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
  window.matchMedia = nativeMatchMedia;
  document.body.replaceChildren();
});

describe("pause breakpoints", () => {
  it("pauses above a width and resumes when the query stops matching", () => {
    mockMatchMedia((media) => media.startsWith("(min-width"));
    const root = makeMarkup(5);
    slider = new Multislider(root, { interval: 0, duration: 0, pauseAbove: 1200 });

    expect(queryFor("min-width").media).toBe("(min-width: 1200.02px)");
    expect(slider.paused).toBe(true);

    queryFor("min-width").set(false);
    expect(slider.paused).toBe(false);
  });

  it("pauses below a width", () => {
    mockMatchMedia(() => false);
    const root = makeMarkup(5);
    slider = new Multislider(root, { interval: 0, duration: 0, pauseBelow: 640 });

    expect(queryFor("max-width").media).toBe("(max-width: 639.98px)");
    expect(slider.paused).toBe(false);

    queryFor("max-width").set(true);
    expect(slider.paused).toBe(true);
  });

  it("registers no query when neither breakpoint is set", () => {
    mockMatchMedia(() => false);
    const root = makeMarkup(5);
    slider = new Multislider(root, { interval: 0, duration: 0 });
    expect(queries.some((query) => query.media.includes("width"))).toBe(false);
  });

  it("survives a browser without matchMedia", () => {
    // @ts-expect-error deliberately removing the API
    delete window.matchMedia;
    const root = makeMarkup(5);
    expect(
      () =>
        (slider = new Multislider(root, {
          interval: 0,
          duration: 0,
          pauseAbove: 900,
        }))
    ).not.toThrow();
  });
});

describe("reduced motion", () => {
  it("pauses the slider and drops the step duration to zero", () => {
    mockMatchMedia((media) => media.includes("prefers-reduced-motion"));
    const root = makeMarkup(5);
    slider = new Multislider(root, { interval: 2000, duration: 500 });
    const track = root.querySelector<HTMLElement>(".ms-track")!;

    expect(slider.paused).toBe(true);

    slider.next();
    // a zero duration means the step lands without waiting for a frame
    expect(track.style.transform).toBe("translate3d(-100px, 0, 0)");
    expect(raf.pending).toBe(0);
  });

  it("resumes and restores the duration when the preference changes", () => {
    mockMatchMedia((media) => media.includes("prefers-reduced-motion"));
    const root = makeMarkup(5);
    slider = new Multislider(root, { interval: 0, duration: 500 });
    const track = root.querySelector<HTMLElement>(".ms-track")!;

    queryFor("prefers-reduced-motion").set(false);
    expect(slider.paused).toBe(false);

    slider.next();
    expect(raf.pending).toBe(1);
    expect(track.style.transform).toBe("translate3d(0px, 0, 0)");
  });

  it("ignores the preference when respectReducedMotion is false", () => {
    mockMatchMedia((media) => media.includes("prefers-reduced-motion"));
    const root = makeMarkup(5);
    slider = new Multislider(root, {
      interval: 0,
      duration: 0,
      respectReducedMotion: false,
    });
    expect(slider.paused).toBe(false);
  });
});
