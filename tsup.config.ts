import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts', host: 'src/host.ts', react: 'src/react.ts', meta: 'src/meta.ts', check: 'src/check.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    target: 'es2020',
    external: ['react'],
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    target: 'node18',
    platform: 'node',
  },
  {
    entry: { playfold: 'src/browser.ts' },
    format: ['iife'],
    minify: true,
    target: 'es2018',
  },
]);
