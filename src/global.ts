// Types for the IIFE build (dist/multislider.global.js), which assigns the
// class to window.Multislider. Published via the "./global" subpath export.
import type { Multislider } from "./index";

declare global {
  interface Window {
    Multislider: typeof Multislider;
  }
}

export {};
