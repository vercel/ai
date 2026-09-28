import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  [
    {
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
      platform: 'node',
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
