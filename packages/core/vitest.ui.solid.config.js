import solidPlugin from 'vite-plugin-solid';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [solidPlugin()],
  server: { port: 3000 },
  build: { target: 'esnext' },
  test: {
    environment: 'jsdom',
    include: ['solid/**/*.ui.test.ts', 'solid/**/*.ui.test.tsx'],
    globals: true,
    deps: {
      registerNodeLoader: true,
      inline: [/solid-js/],
    },
    transformMode: { web: [/\.[jt]sx?$/] },
  },
  resolve: {
    conditions: ['development', 'browser'],
  },
});
