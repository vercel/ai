import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  mergeConfig(tsdownBaseConfig, {
    entry: ['src/index.ts'],
    tsconfig: 'tsconfig.build.json',
    define: {
      __PACKAGE_VERSION__: JSON.stringify(
        (await import('./package.json', { with: { type: 'json' } })).default
          .version,
      ),
    },
  }),
);
