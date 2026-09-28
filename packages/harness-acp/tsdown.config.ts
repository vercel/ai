import { defineConfig } from 'tsdown';

const packageVersion = JSON.stringify(
  (await import('./package.json', { with: { type: 'json' } })).default.version,
);

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'es2022',
    dts: true,
    sourcemap: true,
    define: {
      __PACKAGE_VERSION__: packageVersion,
    },
  },
  {
    entry: { 'bridge/index': 'src/v1/bridge/index.ts' },
    format: ['esm'],
    target: 'es2022',
    outExtensions: () => ({ js: '.mjs' }),
    dts: false,
    sourcemap: true,
    platform: 'node',
    deps: {
      alwaysBundle: ['@ai-sdk/harness', '@ai-sdk/provider-utils'],
      neverBundle: [
        '@agentclientprotocol/sdk',
        '@modelcontextprotocol/sdk',
        'ws',
        'zod',
      ],
    },
    outputOptions: { codeSplitting: false },
    define: {
      __PACKAGE_VERSION__: packageVersion,
    },
  },
  {
    entry: { 'bridge/host-tool-mcp': 'src/v1/bridge/host-tool-mcp.ts' },
    format: ['esm'],
    target: 'es2022',
    outExtensions: () => ({ js: '.mjs' }),
    dts: false,
    sourcemap: true,
    platform: 'node',
    deps: {
      alwaysBundle: ['@ai-sdk/harness', '@ai-sdk/provider-utils'],
      neverBundle: [
        '@agentclientprotocol/sdk',
        '@modelcontextprotocol/sdk',
        'ws',
        'zod',
      ],
    },
    outputOptions: { codeSplitting: false },
    define: {
      __PACKAGE_VERSION__: packageVersion,
    },
  },
]);
