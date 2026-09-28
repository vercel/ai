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
      // The bridge core runs inside the sandbox and is re-bundled into each
      // adapter's `bridge.mjs`. `ws` is resolved from the sandbox-installed
      // node_modules, never bundled here.
      entry: { 'bridge/index': 'bridge/index.ts' },
      platform: 'node',
      deps: { neverBundle: ['ws'] },
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
