import { defineConfig } from 'tsdown';

export default defineConfig([
  // RSC APIs - shared client
  {
    // Kept as a separate external chunk so server and client bundles share a single module instance at runtime.
    entry: ['src/rsc-shared.ts'],
    outDir: 'dist',
    format: ['esm'],
    target: 'es2022',
    deps: { neverBundle: ['react', 'zod'] },
    dts: true,
    sourcemap: true,
  },
  // RSC APIs - server, client
  {
    entry: ['src/rsc-server.ts', 'src/rsc-client.ts'],
    outDir: 'dist',
    format: ['esm'],
    target: 'es2022',
    deps: { neverBundle: ['react', 'zod', /\/rsc-shared/] },
    dts: true,
    sourcemap: true,
  },
  // RSC APIs - types
  {
    entry: ['src/types/index.ts'],
    outDir: 'dist',
    format: ['esm'],
    target: 'es2022',
    dts: true,
  },
]);
