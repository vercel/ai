import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'es2022',
    dts: true,
    sourcemap: true,
    platform: 'node',
    deps: {
      neverBundle: [
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
  },
  {
    entry: ['src/with-vitest.ts'],
    format: ['esm'],
    target: 'es2022',
    dts: true,
    sourcemap: true,
    platform: 'node',
  },
]);
