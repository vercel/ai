import { defineConfig } from 'tsdown';
import { removeDanglingDeclarationSourcemapComments } from '../../tools/tsdown/declaration-sourcemaps.mts';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outDir: 'dist',
    deps: {
      dts: {
        neverBundle: ['@ai-sdk/provider-utils'],
      },
    },
    dts: {
      sourcemap: false,
    },
    outputOptions: {
      plugins: [removeDanglingDeclarationSourcemapComments()],
    },
    sourcemap: true,
    target: 'es2018',
    tsconfig: 'tsconfig.build.json',
    platform: 'node',
    clean: false,
    fixedExtension: false,
  },
]);
