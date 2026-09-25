import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    platform: 'node',
  },
  {
    entry: ['src/with-vitest.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
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
]);
