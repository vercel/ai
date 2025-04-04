import { defineConfig } from 'tsup';

export default defineConfig([
  // Universal APIs
  {
    entry: ['index.ts'],
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
    outDir: 'dist/test',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
  // MCP stdio
  {
    entry: ['mcp-stdio/index.ts'],
    outDir: 'dist/mcp-stdio',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
]);
