import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(async ({ command, mode }) => {
  // Dynamic import (commonjs)
  // see https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/faq.md#how-can-i-use-vite-plugin-svelte-from-commonjs
  const { svelte } = await import('@sveltejs/vite-plugin-svelte');

  return {
    plugins: [svelte()],
    test: {
      environment: 'jsdom',
      include: ['svelte/**/*.ui.test.ts', 'svelte/**/*.ui.test.tsx'],
      exclude: ['node_modules/**'],
    },
  };
});
