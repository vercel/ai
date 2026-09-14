import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    target: 'es2018',
    platform: 'node',
  },
  {
    entry: ['src/with-vitest.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    target: 'es2020',
    platform: 'node',
    external: [
      'chai',
      'msw',
      'msw/*',
      'vitest',
      'vitest/*',
      '@vitest/*',
      'vitest/dist/*',
      'vitest/dist/chunks/*',
      'vitest/dist/node/*',
      'vitest/dist/node/chunks/*',
    ],
  },
  {
    entry: {
      index: 'src/index.ts',
      'with-vitest': 'src/with-vitest.ts',
    },
    dts: { only: true },
    format: ['esm'],
  },
]);
