import { defineConfig } from 'tsdown';
import { removeDanglingDeclarationSourcemapComments } from '../../tools/tsdown/declaration-sourcemaps.mts';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outDir: 'dist',
    dts: {
      sourcemap: false,
    },
    outputOptions: {
      plugins: [removeDanglingDeclarationSourcemapComments()],
    },
    sourcemap: true,
    target: 'es2018',
    platform: 'node',
    tsconfig: 'tsconfig.build.json',
    clean: false,
    fixedExtension: false,
  },
  {
    entry: ['src/with-vitest.ts'],
    format: ['esm'],
    outDir: 'dist',
    dts: {
      sourcemap: false,
    },
    outputOptions: {
      plugins: [removeDanglingDeclarationSourcemapComments()],
    },
    sourcemap: true,
    target: 'es2020',
    platform: 'node',
    deps: {
      neverBundle: [
        'chai',
        'msw',
        'msw/*',
        'vitest',
        'vitest/*',
        '@vitest/*',
        'vitest/dist/*',
        'vitest/dist/chunks/*',
        'vitest/dist/node/*',
        'vitest/dist/node/chunks/*',
      ],
    },
    tsconfig: 'tsconfig.build.json',
    clean: false,
    fixedExtension: false,
  },
]);
