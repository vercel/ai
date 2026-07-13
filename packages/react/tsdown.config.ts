import { defineConfig } from 'tsdown';
import { removeDanglingDeclarationSourcemapComments } from '../../tools/tsdown/declaration-sourcemaps.mts';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    format: ['esm'],
    deps: {
      neverBundle: ['vue'],
    },
    dts: {
      sourcemap: false,
    },
    outputOptions: {
      plugins: [removeDanglingDeclarationSourcemapComments()],
    },
    sourcemap: true,
    tsconfig: 'tsconfig.build.json',
    target: 'es2018',
    platform: 'node',
    clean: false,
    fixedExtension: false,
  },
]);
