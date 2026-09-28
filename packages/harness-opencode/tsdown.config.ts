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
    entry: {
      'bridge/index': 'src/bridge/index.ts',
      'bridge/host-tool-mcp': 'src/bridge/host-tool-mcp.ts',
    },
    format: ['esm'],
    target: 'es2022',
    outExtensions: () => ({ js: '.mjs' }),
    dts: false,
    sourcemap: true,
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
]);
