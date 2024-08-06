import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['rsc/**/*.ui.test.ts{,x}'],
    exclude: ['**/node_modules/**'],
  },
});
