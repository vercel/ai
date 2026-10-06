import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  [
    {
      define: {
        __PACKAGE_VERSION__: JSON.stringify(
          (await import('./package.json', { with: { type: 'json' } })).default
            .version,
        ),
      },
    },
    {
      entry: ['src/experimental-decision/index.ts'],
      outDir: 'dist/experimental-decision',
    },
    {
      entry: ['src/experimental-evaluation/index.ts'],
      outDir: 'dist/experimental-evaluation',
    },
    {
      entry: ['src/test/index.ts'],
      outDir: 'dist/test',
      // Avoid bundling Chai and other test dependencies.
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
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
