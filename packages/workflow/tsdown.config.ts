import { defineConfig } from 'tsdown';
import { removeDanglingDeclarationSourcemapComments } from '../../tools/tsdown/declaration-sourcemaps.mts';

export default defineConfig({
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
  // Keep library target conservative for wide compatibility
  target: 'es2018',
  platform: 'node',
  define: {
    __PACKAGE_VERSION__: JSON.stringify(
      (await import('./package.json', { with: { type: 'json' } })).default
        .version,
    ),
  },
  tsconfig: 'tsconfig.build.json',
  clean: false,
  fixedExtension: false,
});
