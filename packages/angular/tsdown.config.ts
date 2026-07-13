import { defineConfig } from 'tsdown';
import { removeDanglingDeclarationSourcemapComments } from '../../tools/tsdown/declaration-sourcemaps.mts';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: {
    sourcemap: false,
  },
  outputOptions: {
    plugins: [removeDanglingDeclarationSourcemapComments()],
  },
  format: ['esm'],
  outDir: 'dist',
  sourcemap: true,
  clean: false,
  target: 'es2022',
  // deps: { neverBundle: [/node_modules/] } // list explicit externals here if needed
  tsconfig: 'tsconfig.build.json',
  platform: 'node',
  fixedExtension: false,
});
