import { defineConfig } from 'vite';
// import TestResultReporter from './src/test-result-reporter'

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts', '**/*.test.tsx', '**/*.test.mts'],
    reporters: ['dot'], // new TestResultReporter()
  },
});
