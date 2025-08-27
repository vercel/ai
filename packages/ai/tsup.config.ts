import { defineConfig } from 'tsup';

export default defineConfig([
  // Universal APIs
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    external: ['react', 'svelte', 'vue', 'chai', 'chai/*'],
    dts: true,
    sourcemap: true,
    target: 'es2018',
    platform: 'node',
  },
  // Internal APIs
  {
    entry: ['internal/index.ts'],
    outDir: 'dist/internal',
    format: ['cjs', 'esm'],
    external: ['chai', 'chai/*'],
    dts: true,
    sourcemap: true,
    target: 'es2018',
    platform: 'node',
  },
  // Test utilities
  {
    entry: ['test/index.ts'],
    outDir: 'dist/test',
    format: ['cjs', 'esm'],
    external: [
      'chai',
      'chai/*',
      'vitest',
      'vitest/*',
      '@vitest/*',
      'vitest/dist/*',
      'vitest/dist/chunks/*',
      'vitest/dist/node/*',
      'vitest/dist/node/chunks/*',
    ],
    dts: true,
    sourcemap: true,
    // Allow BigInt in tests
    target: 'es2020',
    platform: 'node',
  },
  // MCP stdio
  {
    entry: ['mcp-stdio/index.ts'],
    outDir: 'dist/mcp-stdio',
    format: ['cjs', 'esm'],
    external: ['chai', 'chai/*'],
    dts: true,
    sourcemap: true,
    target: 'es2018',
    platform: 'node',
  },
]);
