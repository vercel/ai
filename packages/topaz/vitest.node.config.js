import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import packageJson from './package.json';

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    setupFiles: [
      fileURLToPath(
        new URL('../../tools/setup-download-fetch.node.js', import.meta.url),
      ),
    ],
  },
  define: {
    __PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
});
