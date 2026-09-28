import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  [
    // Middleware entry (main package export)
    {
      sourcemap: false,
      outDir: 'dist',
      clean: false,
    },
    // Viewer server
    {
      entry: ['src/viewer/server.ts'],
      dts: false,
      sourcemap: false,
      outDir: 'dist/viewer',
      clean: false,
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
