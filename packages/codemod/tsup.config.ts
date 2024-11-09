import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/test/index.ts'],
    outDir: 'test/dist',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
  {
    entry: ['src/bin/codemod.ts'],
    outDir: 'dist/bin',
    format: ['cjs'],
    dts: false,
    sourcemap: true,
  },
  {
    entry: ['src/codemods/rewrite-framework-imports.ts'],
    outDir: 'dist/codemods',
    format: ['cjs'],
    dts: false,
    sourcemap: true,
  },
  {
    entry: ['src/codemods/replace-nanoid.ts'],
    outDir: 'dist/codemods',
    format: ['cjs'],
    dts: false,
    sourcemap: true,
  },
]);
