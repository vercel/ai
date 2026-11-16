import { defineConfig, mergeConfig } from 'tsdown';

import { tsdownBaseConfig } from '@vercel/ai-tsdown-config';

export default defineConfig(
  [
    {},
    {
      entry: { 'agent/index': 'agent/index.ts' },
    },
    {
      entry: { 'utils/index': 'utils/index.ts' },
    },
    {
      entry: { 'bridge/index': 'bridge/index.ts' },
    },
    {
      entry: { 'next/index': 'next/index.ts' },
    },
    {
      entry: { 'vercel/index': 'vercel/index.ts' },
    },
  ].map(config => mergeConfig(tsdownBaseConfig, config)),
);
