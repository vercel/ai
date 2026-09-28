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
    {
      entry: {
        'bridge/index': 'src/bridge/index.ts',
        'bridge/host-tool-mcp': 'src/bridge/host-tool-mcp.ts',
      },
      outExtensions: () => ({ js: '.mjs' }),
      dts: false,
      platform: 'node',
      deps: {
        alwaysBundle: ['@ai-sdk/harness'],
        neverBundle: [
          '@opencode-ai/sdk/v2',
          '@modelcontextprotocol/sdk',
          'opencode-ai',
          'ws',
          'zod',
        ],
      },
      define: {
        __PACKAGE_VERSION__: packageVersion,
      },
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
