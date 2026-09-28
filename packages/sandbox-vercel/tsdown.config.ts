import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  [
    {
      entry: { index: 'src/index.ts' },
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
