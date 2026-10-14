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
      // the sandbox only installs the bridge's own deps (src/bridge/package.json),
      // so a bare import would not resolve there. The runtime SDKs the bridge
      // imports are installed in-sandbox and stay external.
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
