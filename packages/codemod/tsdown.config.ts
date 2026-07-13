import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/bin/codemod.ts'],
    outDir: 'dist/bin',
    format: ['cjs'],
    dts: false,
    sourcemap: true,
    tsconfig: 'tsconfig.build.json',
    target: 'es2018',
    platform: 'node',
    cjsDefault: false,
    outputOptions: {
      esModule: true,
      generatedCode: {
        symbols: false,
      },
      strict: true,
    },
    clean: false,
    fixedExtension: false,
  },
  {
    entry: ['src/codemods/**/*.ts'],
    outDir: 'dist/codemods',
    format: ['cjs'],
    dts: false,
    sourcemap: true,
    tsconfig: 'tsconfig.build.json',
    target: 'es2018',
    platform: 'node',
    cjsDefault: false,
    outputOptions: {
      esModule: true,
      generatedCode: {
        symbols: false,
      },
      strict: true,
    },
    clean: false,
    fixedExtension: false,
  },
]);
