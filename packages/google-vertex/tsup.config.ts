import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    outDir: 'dist',
  },
  {
    entry: ['src/edge/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    outDir: 'edge/dist',
  },
  {
    entry: ['src/anthropic/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    outDir: 'anthropic/dist',
  },
  {
    entry: ['src/anthropic/edge/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    outDir: 'anthropic/edge/dist',
  },
]);
