import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  [
    // Universal APIs
    {
      deps: { neverBundle: ['react', 'svelte', 'vue', 'chai', 'chai/*'] },
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
      deps: { neverBundle: ['chai', 'chai/*'] },
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
      deps: {
        neverBundle: [
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
      },
      define: {
        __PACKAGE_VERSION__: JSON.stringify(
          (await import('./package.json', { with: { type: 'json' } })).default
            .version,
        ),
      },
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
