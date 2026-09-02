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
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    clean: false,
    dts: false,
    sourcemap: true,
    target: 'es2022',
    platform: 'node',
    unbundle: true,
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    clean: false,
    dts: {
      only: true,
    },
    target: 'es2022',
    platform: 'node',
  },
]);
