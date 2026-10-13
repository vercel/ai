import { configDefaults } from 'vitest/config';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: [...configDefaults.exclude, '**/*.node.test.ts'],
  },
});
