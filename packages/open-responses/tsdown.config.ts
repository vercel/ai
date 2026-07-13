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
    tsconfig: 'tsconfig.build.json',
    define: {
      __PACKAGE_VERSION__: JSON.stringify(
        (await import('./package.json', { with: { type: 'json' } })).default
          .version,
      ),
    },
    target: 'es2018',
    platform: 'node',
    clean: false,
    fixedExtension: false,
  },
]);
