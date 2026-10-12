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
      entry: { 'bridge/index': 'src/bridge/index.ts' },
      outExtensions: () => ({ js: '.mjs' }),
      dts: false,
      // The shared bridge runtime (`@ai-sdk/harness/bridge`) must be INLINED —
      // the sandbox only installs the bridge's own deps, so a bare import would
      // not resolve there. tsdown externalizes package.json deps by default, hence
      // the explicit override.
      // SDK + MCP deps live inside the sandbox-installed node_modules; never
      // bundle them into bridge.mjs. ws and zod are also installed by the
      // bridge's pnpm install step so the host package's own copy is irrelevant.
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
