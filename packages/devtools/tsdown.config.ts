import { defineConfig } from 'tsdown';
import { removeDanglingDeclarationSourcemapComments } from '../../tools/tsdown/declaration-sourcemaps.mts';

export default defineConfig([
  // Middleware entry (main package export)
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    deps: {
      dts: {
        neverBundle: ['ai'],
      },
    },
    dts: {
      sourcemap: false,
    },
    outputOptions: {
      plugins: [removeDanglingDeclarationSourcemapComments()],
    },
    sourcemap: false,
    outDir: 'dist',
    clean: false,
    tsconfig: 'tsconfig.build.json',
    target: 'es2022',
    platform: 'node',
    fixedExtension: false,
  },
  // Viewer server
  {
    entry: ['src/viewer/server.ts'],
    format: ['esm'],
    outDir: 'dist/viewer',
    clean: false,
    tsconfig: 'tsconfig.build.json',
    dts: false,
    sourcemap: false,
    target: 'es2022',
    platform: 'node',
    fixedExtension: false,
  },
]);
