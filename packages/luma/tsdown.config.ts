import { defineConfig } from 'tsdown';
import { removeDanglingDeclarationSourcemapComments } from '../../tools/tsdown/declaration-sourcemaps.mts';
import { removeUnusedDeclarationImports } from '../../tools/tsdown/remove-unused-declaration-imports.mts';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outDir: 'dist',
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
      __PACKAGE_VERSION__: JSON.stringify(
        (await import('./package.json', { with: { type: 'json' } })).default
          .version,
      ),
    },
    tsconfig: 'tsconfig.build.json',
    target: 'es2018',
    platform: 'node',
    clean: false,
    fixedExtension: false,
  },
]);
