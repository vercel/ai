import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  mergeConfig(tsdownBaseConfig, {
    outDir: 'dist',
    clean: true,
    // external: [/node_modules/] // you can list external deps here if needed
  }),
);
