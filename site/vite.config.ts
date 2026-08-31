import { defineConfig } from 'vite';

// Absolute path to the library entry, derived without any node: imports so the
// repo can typecheck this file without @types/node installed.
const libraryEntry = decodeURIComponent(new URL('../src/index.ts', import.meta.url).pathname)
  // "/C:/repo/src/index.ts" on Windows, "/repo/src/index.ts" elsewhere.
  .replace(/^\/([A-Za-z]:)/, '$1');

// The docs site imports the library source directly, so demos always reflect
// the current state of src/ with no build step in between.
export default defineConfig({
  resolve: {
    alias: {
      '@tjblackman/multislider': libraryEntry,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
});
