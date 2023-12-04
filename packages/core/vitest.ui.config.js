import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), react()],
  test: {
    environment: 'jsdom',
    include: ['**/*.ui.test.ts', '**/*.ui.test.tsx'],
    exclude: ['node_modules/**'],
  },
});
