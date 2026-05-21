import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
  },
  {
    entry: { 'harness/index': 'harness/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
  },
]);
