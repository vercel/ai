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
    outDir: 'dist/test',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
]);
