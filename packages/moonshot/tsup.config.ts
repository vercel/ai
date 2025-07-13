import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    external: [
      '@ai-sdk/provider',
      '@ai-sdk/provider-utils',
      '@ai-sdk/openai-compatible',
    ],
    dts: true,
    sourcemap: true,
    clean: true,
  },
]);
