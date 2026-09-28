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
      entry: { 'bridge/index': 'src/v1/bridge/index.ts' },
      outExtensions: () => ({ js: '.mjs' }),
      dts: false,
      deps: {
        alwaysBundle: ['@ai-sdk/harness', '@ai-sdk/provider-utils'],
        neverBundle: ['@agentclientprotocol/sdk', '@modelcontextprotocol/sdk'],
      },
      outputOptions: { codeSplitting: false },
      define: {
        __PACKAGE_VERSION__: packageVersion,
      },
    },
    {
      entry: { 'bridge/host-tool-mcp': 'src/v1/bridge/host-tool-mcp.ts' },
      outExtensions: () => ({ js: '.mjs' }),
      dts: false,
      deps: {
        alwaysBundle: ['@ai-sdk/harness', '@ai-sdk/provider-utils'],
        neverBundle: ['@agentclientprotocol/sdk', '@modelcontextprotocol/sdk'],
      },
      outputOptions: { codeSplitting: false },
      define: {
        __PACKAGE_VERSION__: packageVersion,
      },
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
