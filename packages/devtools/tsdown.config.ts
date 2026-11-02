import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '@vercel/ai-tsdown-config';

export default defineConfig(
  [
    // Middleware entry (main package export)
    {
      deps: {
        neverBundle: ['ai'],
      },
      sourcemap: false,
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
