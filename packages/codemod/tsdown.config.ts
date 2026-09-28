import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/bin/codemod.ts'],
    outDir: 'dist/bin',
    format: ['cjs'],
    target: 'es2022',
    dts: false,
    sourcemap: true,
  },
  {
    entry: ['src/codemods/**/*.ts'],
    outDir: 'dist/codemods',
    format: ['cjs'],
    target: 'es2022',
    dts: false,
    sourcemap: true,
  },
]);
