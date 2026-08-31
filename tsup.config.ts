import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
  },
  {
    entry: { "multislider.global": "src/index.ts" },
    format: ["iife"],
    globalName: "__MultisliderLib",
    footer: {
      js: "window.Multislider = __MultisliderLib.Multislider;",
    },
    minify: true,
    sourcemap: true,
    target: "es2022",
  },
]);
