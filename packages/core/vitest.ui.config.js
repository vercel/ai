import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['**/*.ui.test.ts', '**/*.ui.test.tsx'],
    exclude: ['node_modules/**'],
  },
});
