import { defineConfig } from 'tsup';

export default defineConfig([
  // Universal APIs
  {
    entry: ['src/index.ts'],
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
  // CLI binary minified
  {
    entry: ['src/bin/ai.ts'],
    outDir: 'dist/bin',
    outExtension: () => ({ js: '.min.js' }),
    format: 'cjs',
    bundle: true,
    minify: true,
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: false,
    noExternal: [/.*/],
  },
]);
