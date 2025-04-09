import { defineConfig } from 'tsup';

export default defineConfig([
  // Universal APIs
  {
    entry: ['streams/index.ts'],
    format: ['cjs', 'esm'],
    external: ['react', 'svelte', 'vue'],
    dts: true,
    sourcemap: true,
  },
  // Internal APIs
  {
    entry: ['internal/index.ts'],
    outDir: 'dist/internal',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
  // Test utilities
  {
    entry: ['test/index.ts'],
    outDir: 'test/dist',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
  // MCP stdio
  {
    entry: ['mcp-stdio/index.ts'],
    outDir: 'mcp-stdio/dist',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
]);
