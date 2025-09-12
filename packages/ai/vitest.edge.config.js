import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
).version;

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __PACKAGE_VERSION__: JSON.stringify(version),
  },
  test: {
    environment: 'edge-runtime',
    include: ['**/*.test.ts{,x}'],
    exclude: [
      '**/*.ui.test.ts{,x}',
      '**/*.e2e.test.ts{,x}',
      '**/node_modules/**',
    ],
    typecheck: {
      enabled: true,
    },
  },
});
