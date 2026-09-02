import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    clean: false,
    dts: true,
    sourcemap: true,
    target: 'es2018',
    platform: 'node',
  },
  {
    entry: ['src/with-vitest.ts'],
    format: ['esm'],
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    clean: false,
    dts: true,
    sourcemap: true,
    target: 'es2020',
    platform: 'node',
    deps: {
      neverBundle: [
        'chai',
        'chai/*',
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
]);
