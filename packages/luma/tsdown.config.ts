import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  [
    {
      entry: ['src/index.ts'],
      define: {
        __PACKAGE_VERSION__: JSON.stringify(
          (await import('./package.json', { with: { type: 'json' } })).default
            .version,
        ),
      },
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
