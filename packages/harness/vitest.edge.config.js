import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // The sandbox bridge runtime is node-only (binds a real WebSocket server
    // via `ws` + `node:http`); its test cannot run under edge-runtime.
    // The Next.js and Vercel config helpers read the project's files with
    // `node:fs`, at build time.
    exclude: [
      '**/src/bridge/**',
      '**/src/next/**',
      '**/src/vercel/**',
      '**/node_modules/**',
    ],
  },
});
