import solidPlugin from 'vite-plugin-solid';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [solidPlugin()],
  server: { port: 3000 },
  build: { target: 'esnext' },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.ui.test.ts', 'src/**/*.ui.test.tsx'],
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
