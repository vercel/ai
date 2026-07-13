import { defineConfig } from 'tsdown';
import { removeDanglingDeclarationSourcemapComments } from '../../tools/tsdown/declaration-sourcemaps.mts';
import { removeUnusedDeclarationImports } from '../../tools/tsdown/remove-unused-declaration-imports.mts';
export default defineConfig([
  // Universal APIs
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outDir: 'dist',
    deps: {
      neverBundle: ['react', 'svelte', 'vue', 'chai', 'chai/*'],
    },
    dts: {
      sourcemap: false,
    },
    outputOptions: {
      plugins: [removeDanglingDeclarationSourcemapComments()],
    },
    sourcemap: true,
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
  },
  // Internal APIs
  {
    entry: ['internal/index.ts'],
    outDir: 'dist/internal',
    format: ['esm'],
    deps: {
      neverBundle: ['chai', 'chai/*'],
    },
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
  },
  // Test utilities
  {
    entry: ['test/index.ts'],
    outDir: 'dist/test',
    format: ['esm'],
    deps: {
      neverBundle: [
        'chai',
        'chai/*',
        'vitest',
        'vitest/*',
        '@vitest/*',
        'vitest/dist/*',
        'vitest/dist/chunks/*',
        'vitest/dist/node/*',
        'vitest/dist/node/chunks/*',
      ],
    },
    dts: {
      sourcemap: false,
    },
    outputOptions: {
      plugins: [removeDanglingDeclarationSourcemapComments()],
    },
    sourcemap: true,
    // Allow BigInt in tests
    target: 'es2020',
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
  },
]);
