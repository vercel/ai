import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __PACKAGE_VERSION__: '"test"' },
  resolve: {
    alias: [
      {
        find: /^zod(?=\/|$)/,
        replacement: fileURLToPath(
          new URL('./node_modules/zod-modern', import.meta.url),
        ),
      },
      {
        find: /^@ai-sdk\/provider-utils$/,
        replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/openai-chat-json-stream.test.js'],
    restoreMocks: true,
  },
});
