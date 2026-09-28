import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  [
    {
      entry: ['src/index.ts'],
    },
    {
      entry: ['src/tool/mcp-stdio/index.ts'],
      outDir: 'dist/mcp-stdio',
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
