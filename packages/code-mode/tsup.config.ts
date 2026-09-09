import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: [
      'src/**/*.ts',
      '!src/**/*.test.ts',
      '!src/e2e/**/*.ts',
      '!src/utils/test-helpers.ts',
    ],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    target: 'es2022',
    platform: 'node',
    bundle: false,
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: {
      only: true,
    },
    target: 'es2022',
    platform: 'node',
  },
]);
