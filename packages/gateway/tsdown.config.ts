import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '@vercel/ai-tsdown-config';

const define = {
  __PACKAGE_VERSION__: JSON.stringify(
    (await import('./package.json', { with: { type: 'json' } })).default
      .version,
  ),
};

export default defineConfig(
  [
    // Emit one module per source file so that bundlers can drop unused
    // modalities (`sideEffects: false`), e.g. when `ai` resolves a string
    // model ID with a single default model factory.
    {
      entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.test-d.ts'],
      dts: false,
      unbundle: true,
      define,
    },
    {
      dts: {
        emitDtsOnly: true,
      },
      sourcemap: false,
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
