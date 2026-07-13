import { defineConfig } from 'tsdown';
import { removeDanglingDeclarationSourcemapComments } from '../../tools/tsdown/declaration-sourcemaps.mts';
import { removeUnusedDeclarationImports } from '../../tools/tsdown/remove-unused-declaration-imports.mts';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    outDir: 'dist',
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
  {
    entry: { 'agent/index': 'agent/index.ts' },
    format: ['esm'],
    outDir: 'dist',
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
  {
    entry: { 'utils/index': 'utils/index.ts' },
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
    // The bridge core runs inside the sandbox and is re-bundled into each
    // adapter's `bridge.mjs`. `ws` is resolved from the sandbox-installed
    // node_modules, never bundled here.
    entry: { 'bridge/index': 'bridge/index.ts' },
    format: ['esm'],
    outDir: 'dist',
    target: 'es2022',
    platform: 'node',
    dts: {
      sourcemap: false,
    },
    outputOptions: {
      plugins: [removeDanglingDeclarationSourcemapComments()],
    },
    sourcemap: true,
    deps: {
      neverBundle: ['ws'],
    },
    tsconfig: 'tsconfig.build.json',
    clean: false,
    fixedExtension: false,
  },
]);
