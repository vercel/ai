import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  [
    {
      entry: [
        'src/**/*.ts',
        '!src/**/*.test.ts',
        '!src/e2e/**/*.ts',
        '!src/utils/test-helpers.ts',
      ],
      dts: false,
      platform: 'node',
      unbundle: true,
    },
    {
      dts: {
        emitDtsOnly: true,
      },
      sourcemap: false,
      platform: 'node',
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
