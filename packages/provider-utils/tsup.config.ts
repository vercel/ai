import { defineConfig } from 'tsup';

const packageVersion = (
  await import('./package.json', { with: { type: 'json' } })
).default.version;

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    define: {
      __PACKAGE_VERSION__: JSON.stringify(packageVersion),
    },
  },
  {
    entry: ['src/experimental-evaluation/index.ts'],
    outDir: 'dist/experimental-evaluation',
    format: ['esm'],
    dts: true,
    sourcemap: true,
    platform: 'node',
  },
  {
    entry: ['src/test/index.ts'],
    outDir: 'dist/test',
    format: ['esm'],
    dts: true,
    sourcemap: true,
    // Avoid bundling Chai and other test dependencies.
    platform: 'node',
    external: [
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
    define: {
      __PACKAGE_VERSION__: JSON.stringify(packageVersion),
    },
  },
]);
