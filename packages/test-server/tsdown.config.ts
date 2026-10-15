import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  [
    {},
    {
      entry: ['src/with-vitest.ts'],
      deps: {
        neverBundle: [
          'chai',
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
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
