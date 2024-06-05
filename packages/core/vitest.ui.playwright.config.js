import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    globals: true,
    include: ['rsc/**/*.e2e.test.ts', 'rsc/**/*.e2e.test.tsx'],
    browser: {
      enabled: true,
      provider: 'playwright',
      name: 'chromium',
    },
  },
});
