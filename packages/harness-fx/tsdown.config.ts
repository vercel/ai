import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

const packageVersion = JSON.stringify(
  (await import('./package.json', { with: { type: 'json' } })).default.version,
);

export default defineConfig(
  mergeConfig(tsdownBaseConfig, {
    define: {
      __PACKAGE_VERSION__: packageVersion,
    },
    clean: false,
  }),
);
