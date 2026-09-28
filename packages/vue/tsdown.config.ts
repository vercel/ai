import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  mergeConfig(tsdownBaseConfig, {
    outDir: 'dist',
    banner: {},
    deps: { neverBundle: ['vue'] },
  }),
);
