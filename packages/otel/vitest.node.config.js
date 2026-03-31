import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  define: {
    __PACKAGE_VERSION__: JSON.stringify('0.0.0-test'),
  },
  resolve: {
    alias: {
      'ai/test': path.resolve(__dirname, '../ai/test/index.ts'),
      ai: path.resolve(__dirname, '../ai/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts{,x}'],
    exclude: ['**/node_modules/**'],
  },
});
