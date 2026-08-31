import { defineConfig } from "tsup";

// tsup's bundled rollup-plugin-dts needs the TypeScript 5 compiler API, which the
// installed TypeScript 7 no longer exposes, so tsc emits the declarations instead.
const emitTypes = [
  "tsc src/index.ts src/global.ts",
  "--ignoreConfig",
  "--declaration --emitDeclarationOnly --outDir dist",
  "--target es2022 --module esnext --moduleResolution bundler",
  "--strict --skipLibCheck --verbatimModuleSyntax",
  "--lib es2022,dom,dom.iterable",
].join(" ");

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: true,
    target: "es2022",
    onSuccess: emitTypes,
  },
  {
    entry: { multislider: "src/index.ts" },
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
