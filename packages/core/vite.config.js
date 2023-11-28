import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // plugins: [react()],
  test: {
    environment: 'node',
    exclude: ['**/*.ui.test.ts', '**/*.ui.test.tsx', 'node_modules/**'],
  },
});
