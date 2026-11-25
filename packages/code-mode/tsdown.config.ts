import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '@vercel/ai-tsdown-config';

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
      unbundle: true,
    },
    {
      dts: {
        emitDtsOnly: true,
      },
      sourcemap: false,
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
