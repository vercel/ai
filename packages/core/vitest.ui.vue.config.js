import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['vue/**/*.ui.test.ts', 'vue/**/*.ui.test.tsx'],
  },
});
