import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '@vercel/ai-tsdown-config';

export default defineConfig(
  [
    {
      entry: ['src/bin/codemod.ts'],
      outDir: 'dist/bin',
      format: ['cjs'],
      dts: false,
    },
    {
      entry: ['src/codemods/**/*.ts'],
      outDir: 'dist/codemods',
      format: ['cjs'],
      dts: false,
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
