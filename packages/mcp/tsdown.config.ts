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
    tsconfig: 'tsconfig.build.json',
    target: 'es2018',
    platform: 'node',
    clean: false,
    fixedExtension: false,
  },
  {
    entry: ['src/tool/mcp-stdio/index.ts'],
    format: ['esm'],
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
    outDir: 'dist/mcp-stdio',
    tsconfig: 'tsconfig.build.json',
    target: 'es2018',
    platform: 'node',
    clean: false,
    fixedExtension: false,
  },
]);
