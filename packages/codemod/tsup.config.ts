import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/bin/codemod.ts'],
    outDir: 'dist/bin',
    format: ['esm'],
    dts: false,
    sourcemap: true,
  },
  {
    entry: ['src/codemods/**/*.ts'],
    outDir: 'dist/codemods',
    format: ['esm'],
    dts: false,
    sourcemap: true,
  },
]);
