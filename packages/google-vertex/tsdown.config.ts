import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '../../tools/tsdown-config.mts';

export default defineConfig(
  [
    {
      define: {
        __PACKAGE_VERSION__: JSON.stringify(
          (await import('./package.json', { with: { type: 'json' } })).default
            .version,
        ),
      },
    },
    {
      entry: ['src/edge/index.ts'],
      define: {
        __PACKAGE_VERSION__: JSON.stringify(
          (await import('./package.json', { with: { type: 'json' } })).default
            .version,
        ),
      },
      outDir: 'dist/edge',
    },
    {
      entry: ['src/anthropic/index.ts'],
      define: {
        __PACKAGE_VERSION__: JSON.stringify(
          (await import('./package.json', { with: { type: 'json' } })).default
            .version,
        ),
      },
      outDir: 'dist/anthropic',
    },
    {
      entry: ['src/anthropic/edge/index.ts'],
      define: {
        __PACKAGE_VERSION__: JSON.stringify(
          (await import('./package.json', { with: { type: 'json' } })).default
            .version,
        ),
      },
      outDir: 'dist/anthropic/edge',
    },
    {
      entry: ['src/maas/index.ts'],
      define: {
        __PACKAGE_VERSION__: JSON.stringify(
          (await import('./package.json', { with: { type: 'json' } })).default
            .version,
        ),
      },
      outDir: 'dist/maas',
    },
    {
      entry: ['src/maas/edge/index.ts'],
      define: {
        __PACKAGE_VERSION__: JSON.stringify(
          (await import('./package.json', { with: { type: 'json' } })).default
            .version,
        ),
      },
      outDir: 'dist/maas/edge',
    },
    {
      entry: ['src/xai/index.ts'],
      define: {
        __PACKAGE_VERSION__: JSON.stringify(
          (await import('./package.json', { with: { type: 'json' } })).default
            .version,
        ),
      },
      outDir: 'dist/xai',
    },
    {
      entry: ['src/xai/edge/index.ts'],
      define: {
        __PACKAGE_VERSION__: JSON.stringify(
          (await import('./package.json', { with: { type: 'json' } })).default
            .version,
        ),
      },
      outDir: 'dist/xai/edge',
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
