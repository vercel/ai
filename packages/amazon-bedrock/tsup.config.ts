import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
  {
    entry: ['src/internal/index.ts'],
    outDir: 'internal/dist',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
]);
