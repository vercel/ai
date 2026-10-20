import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const version = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
).version;

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
    __PACKAGE_VERSION__: JSON.stringify(version),
  },
});
