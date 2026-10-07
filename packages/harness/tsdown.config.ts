import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  [
    {},
    {
      entry: { 'agent/index': 'agent/index.ts' },
    },
    {
      entry: { 'utils/index': 'utils/index.ts' },
    },
    {
      entry: { 'bridge/index': 'bridge/index.ts' },
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
