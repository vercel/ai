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
    // This bundle isn't actually used,
    // we export the internal bundle with @internal from the root package
    // and provide different types in package.json for the exports
    // to save duplicating 40kb for bundle size
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
