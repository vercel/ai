import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'es2022',
  platform: 'node',
  dts: true,
  sourcemap: true,
  external: [
    'ai',
    'zod',
    '@vercel/sandbox',
    '@ai-sdk/sandbox-vercel',
    '@ai-sdk/harness',
    '@ai-sdk/harness-claude-code',
    '@ai-sdk/harness-codex',
    '@ai-sdk/harness-pi',
    'harness-http-proxy',
  ],
});
