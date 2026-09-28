import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  [
    {
      entry: ['src/index.ts'],
      outDir: 'dist',
      banner: {},
      deps: { neverBundle: ['vue'] },
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
