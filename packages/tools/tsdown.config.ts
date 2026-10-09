import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  mergeConfig(tsdownBaseConfig, {
    entry: ['src/index.ts', 'src/bash/index.ts'],
  }),
);
