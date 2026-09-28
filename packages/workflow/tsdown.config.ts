import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  mergeConfig(tsdownBaseConfig, {
    entry: ['src/index.ts', 'src/client.ts', 'src/video.ts'],
    // Keep library target conservative for wide compatibility
    platform: 'node',
  }),
);
