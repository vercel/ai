import { defineConfig } from 'tsup';

// Temporary TS6 declaration-build workaround for tsup injecting `baseUrl`.
// Remove these overrides when https://github.com/egoist/tsup/issues/1388 is fixed.
export default defineConfig([
  // Universal APIs
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    external: ['react', 'svelte', 'vue', 'chai', 'chai/*'],
    dts: {
      compilerOptions: {
        ignoreDeprecations: '6.0',
      },
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
  },
  // Internal APIs
  {
    entry: ['internal/index.ts'],
    outDir: 'dist/internal',
    format: ['esm'],
    external: ['chai', 'chai/*'],
    dts: {
      compilerOptions: {
        ignoreDeprecations: '6.0',
      },
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
  },
  // Test utilities
  {
    entry: ['test/index.ts'],
    outDir: 'dist/test',
    format: ['esm'],
    external: [
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
    dts: {
      compilerOptions: {
        ignoreDeprecations: '6.0',
      },
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
  },
]);
