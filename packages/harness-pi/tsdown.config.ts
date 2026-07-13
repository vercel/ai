import { defineConfig } from 'tsdown';
import { removeDanglingDeclarationSourcemapComments } from '../../tools/tsdown/declaration-sourcemaps.mts';
import { removeUnusedDeclarationImports } from '../../tools/tsdown/remove-unused-declaration-imports.mts';

const packageVersion = JSON.stringify(
  (await import('./package.json', { with: { type: 'json' } })).default.version,
);

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  outDir: 'dist',
  target: 'es2022',
  dts: {
    sourcemap: false,
  },
  outputOptions: {
    plugins: [
      removeDanglingDeclarationSourcemapComments(),
      removeUnusedDeclarationImports(),
    ],
  },
  sourcemap: true,
  define: {
    __PACKAGE_VERSION__: packageVersion,
  },
  tsconfig: 'tsconfig.build.json',
  platform: 'node',
  clean: false,
  fixedExtension: false,
});
