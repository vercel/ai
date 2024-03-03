import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'react/**/*.ui.test.ts',
      'react/**/*.ui.test.tsx',
      'rsc/**/*.ui.test.ts',
      'rsc/**/*.ui.test.tsx',
    ],
  },
});
