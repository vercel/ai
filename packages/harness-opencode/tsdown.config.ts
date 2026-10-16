import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

const packageVersion = JSON.stringify(
  (await import('./package.json', { with: { type: 'json' } })).default.version,
);

export default defineConfig(
  [
    {
      define: {
        __PACKAGE_VERSION__: packageVersion,
      },
    },
    /*
     * Each sandbox-side file is bundled on its own. The bootstrap ships these
     * files individually, so a shared chunk between them would not resolve.
     */
    {
      entry: { 'bridge/index': 'src/bridge/index.ts' },
      outExtensions: () => ({ js: '.mjs' }),
      dts: false,
      deps: {
        alwaysBundle: [/^@ai-sdk\/harness(?:\/|$)/],
        neverBundle: true,
      },
      define: {
        __PACKAGE_VERSION__: packageVersion,
      },
    },
    {
      entry: { 'bridge/host-tool-mcp': 'src/bridge/host-tool-mcp.ts' },
      outExtensions: () => ({ js: '.mjs' }),
      dts: false,
      deps: {
        alwaysBundle: [/^@ai-sdk\/harness(?:\/|$)/],
        neverBundle: true,
      },
      define: {
        __PACKAGE_VERSION__: packageVersion,
      },
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
