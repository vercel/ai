import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    banner: {},
    format: ['cjs', 'esm'],
    external: ['vue'],
    dts: true,
    sourcemap: true,
  },
]);
