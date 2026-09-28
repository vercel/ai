import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    banner: {},
    format: ['esm'],
    target: 'es2022',
    deps: { neverBundle: ['vue'] },
    dts: true,
    sourcemap: true,
  },
]);
