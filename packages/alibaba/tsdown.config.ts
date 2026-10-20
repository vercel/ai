import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '@vercel/ai-tsdown-config';

export default defineConfig(
  mergeConfig(tsdownBaseConfig, {
    dts: {
      compilerOptions: {
        composite: false,
      },
    },
    define: {
      __PACKAGE_VERSION__: JSON.stringify(
        (await import('./package.json', { with: { type: 'json' } })).default
          .version,
      ),
    },
  }),
);
