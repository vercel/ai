import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  [
    // RSC APIs - shared client
    {
      // Kept as a separate external chunk so server and client bundles share a single module instance at runtime.
      entry: ['src/rsc-shared.ts'],
      outDir: 'dist',
      deps: { neverBundle: ['react', 'zod'] },
    },
    // RSC APIs - server, client
    {
      entry: ['src/rsc-server.ts', 'src/rsc-client.ts'],
      outDir: 'dist',
      deps: { neverBundle: ['react', 'zod', /\/rsc-shared/] },
    },
    // RSC APIs - types
    {
      entry: ['src/index.ts'],
      outDir: 'dist',
      dts: {
        emitDtsOnly: true,
      },
      sourcemap: false,
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
