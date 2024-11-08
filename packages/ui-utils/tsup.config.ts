import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
  {
    entry: ['src/test/index.ts'],
    outDir: 'test/dist',
    format: ['cjs', 'esm'],
    external: ['vitest'],
    dts: true,
    sourcemap: true,
  },
]);
