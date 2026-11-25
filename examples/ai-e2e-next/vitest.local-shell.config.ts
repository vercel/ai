import { fileURLToPath } from 'node:url';

export default {
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['app/api/chat/openai-local-shell/**/*.test.ts'],
  },
};
