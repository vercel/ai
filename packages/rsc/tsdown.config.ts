import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '@vercel/ai-tsdown-config';

export default defineConfig(
  [
    // RSC APIs - shared client
    {
      // Kept as a separate external chunk so server and client bundles share a single module instance at runtime.
      entry: ['src/rsc-shared.ts'],
    },
    // RSC APIs - server, client
    {
      entry: ['src/rsc-server.ts', 'src/rsc-client.ts'],
      deps: { neverBundle: [/\/rsc-shared/] },
    },
    // RSC APIs - types
    {
      entry: ['src/index.ts'],
      dts: {
        emitDtsOnly: true,
      },
      sourcemap: false,
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
