import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/bin/codemod.ts'],
    outDir: 'dist/bin',
    format: ['cjs'],
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    clean: false,
    target: 'es2018',
    dts: false,
    sourcemap: true,
  },
  {
    entry: ['src/codemods/**/*.ts'],
    outDir: 'dist/codemods',
    format: ['cjs'],
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    clean: false,
    target: 'es2018',
    dts: false,
    sourcemap: true,
  },
]);
