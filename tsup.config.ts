import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts', host: 'src/host.ts', react: 'src/react.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    target: 'es2020',
    external: ['react'],
  },
  {
    entry: { playfold: 'src/browser.ts' },
    format: ['iife'],
    minify: true,
    target: 'es2018',
  },
]);
