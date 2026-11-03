import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '@vercel/ai-tsdown-config';

const packageVersion = JSON.stringify(
  (await import('./package.json', { with: { type: 'json' } })).default.version,
);

export default defineConfig(
  mergeConfig(tsdownBaseConfig, {
    define: {
      __PACKAGE_VERSION__: packageVersion,
    },
  }),
);
