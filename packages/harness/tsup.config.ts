import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
  },
  {
    entry: { 'agent/index': 'agent/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
  },
]);
