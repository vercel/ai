import solid from 'vite-plugin-solid';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    solid({
      ssr: false,
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['node_modules/@testing-library/jest-dom/vitest'],
    include: ['src/**/*.ui.test.ts', 'src/**/*.ui.test.tsx'],
  },
  resolve: {
    conditions: ['development', 'browser'],
  },
});
