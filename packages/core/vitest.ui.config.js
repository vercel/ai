import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(async ({ command, mode }) => {
  // Dynamic import (commonjs)
  // see https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/faq.md#how-can-i-use-vite-plugin-svelte-from-commonjs
  const { svelte } = await import('@sveltejs/vite-plugin-svelte');

  return {
    plugins: [vue(), react(), svelte()],
    test: {
      environment: 'jsdom',
      include: ['**/*.ui.test.ts', '**/*.ui.test.tsx'],
      exclude: ['node_modules/**'],
    },
  };
});
