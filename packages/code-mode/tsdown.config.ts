import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: [
      'src/**/*.ts',
      '!src/**/*.test.ts',
      '!src/e2e/**/*.ts',
      '!src/utils/test-helpers.ts',
    ],
    format: ['esm'],
    target: 'es2022',
    dts: false,
    sourcemap: true,
    platform: 'node',
    unbundle: true,
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'es2022',
    dts: {
      only: true,
    },
    platform: 'node',
  },
]);
