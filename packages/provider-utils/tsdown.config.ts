import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'es2022',
    dts: true,
    sourcemap: true,
    platform: 'node',
    define: {
      __PACKAGE_VERSION__: JSON.stringify(
        (await import('./package.json', { with: { type: 'json' } })).default
          .version,
      ),
    },
  },
  {
    entry: ['src/experimental-evaluation/index.ts'],
    outDir: 'dist/experimental-evaluation',
    format: ['esm'],
    target: 'es2022',
    dts: true,
    sourcemap: true,
    platform: 'node',
  },
  {
    entry: ['src/test/index.ts'],
    outDir: 'dist/test',
    format: ['esm'],
    target: 'es2022',
    dts: true,
    sourcemap: true,
    // Avoid bundling Chai and other test dependencies.
    platform: 'node',
    deps: {
      neverBundle: [
        'chai',
        'vitest',
        'vitest/*',
        'msw',
        'msw/*',
        '@vitest/*',
        'vitest/dist/*',
        'vitest/dist/chunks/*',
        'vitest/dist/node/*',
        'vitest/dist/node/chunks/*',
      ],
    },
    define: {
      __PACKAGE_VERSION__: JSON.stringify(
        (await import('./package.json', { with: { type: 'json' } })).default
          .version,
      ),
    },
  },
]);
