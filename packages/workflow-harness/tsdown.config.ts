import { defineConfig } from 'tsdown';
import { removeDanglingDeclarationSourcemapComments } from '../../tools/tsdown/declaration-sourcemaps.mts';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  outDir: 'dist',
  target: 'es2022',
  dts: {
    sourcemap: false,
  },
  outputOptions: {
    plugins: [removeDanglingDeclarationSourcemapComments()],
  },
  sourcemap: true,
  tsconfig: 'tsconfig.build.json',
  platform: 'node',
  clean: false,
  fixedExtension: false,
});
