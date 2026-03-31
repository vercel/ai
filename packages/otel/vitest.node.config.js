import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts{,x}'],
    exclude: ['**/node_modules/**'],
  },
});
