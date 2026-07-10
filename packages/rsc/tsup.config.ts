import { defineConfig } from 'tsup';

export default defineConfig([
  // RSC APIs - shared client
  {
    // Kept as a separate external chunk so server and client bundles share a single module instance at runtime.
    entry: ['src/rsc-shared.ts'],
    outDir: 'dist',
    format: ['esm'],
    external: ['react', 'zod'],
    dts: {
      compilerOptions: {
        ignoreDeprecations: '6.0',
      },
    },
    sourcemap: true,
  },
  // RSC APIs - server, client
  {
    entry: ['src/rsc-server.ts', 'src/rsc-client.ts'],
    outDir: 'dist',
    format: ['esm'],
    external: ['react', 'zod', /\/rsc-shared/],
    dts: {
      compilerOptions: {
        ignoreDeprecations: '6.0',
      },
    },
    sourcemap: true,
  },
  // RSC APIs - types
  {
    entry: ['src/types/index.ts'],
    outDir: 'dist',
    format: ['esm'],
    dts: {
      compilerOptions: {
        ignoreDeprecations: '6.0',
      },
    },
  },
]);
