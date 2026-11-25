import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '@vercel/ai-tsdown-config';

export default defineConfig(
  mergeConfig(tsdownBaseConfig, {
    entry: ['src/index.ts', 'src/client.ts', 'src/video.ts'],
  }),
);
