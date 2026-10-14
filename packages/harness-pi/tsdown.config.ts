import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

const packageVersion = JSON.stringify(
  (await import('./package.json', { with: { type: 'json' } })).default.version,
);

export default defineConfig(
  mergeConfig(tsdownBaseConfig, {
    deps: {
      alwaysBundle: ['pi-mcp-adapter'],
      neverBundle: ['glimpseui'],
    },
    copy: ['node_modules/pi-mcp-adapter/app-bridge.bundle.js'],
    define: {
      __PACKAGE_VERSION__: packageVersion,
    },
  }),
);
