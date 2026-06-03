import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'es2022',
  platform: 'node',
  dts: true,
  sourcemap: true,
  external: [
    'ws',
    '@vercel/sandbox',
    '@ai-sdk/sandbox-vercel',
    '@ai-sdk/harness',
  ],
});
