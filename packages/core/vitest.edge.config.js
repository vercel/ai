import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    globals: true,
    include: ['**/*.test.ts{,x}'],
    exclude: [
      '**/*.ui.test.ts{,x}',
      '**/*.e2e.test.ts{,x}',
      '**/node_modules/**',
    ],
    typecheck: {
      enabled: true,
    },
  },
});
