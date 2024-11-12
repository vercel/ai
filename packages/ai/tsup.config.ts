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
  // Test utilities
  {
    entry: ['test/index.ts'],
    outDir: 'test/dist',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
  // React APIs
  {
    entry: ['react/index.ts'],
    outDir: 'react/dist',
    banner: {
      js: "'use client'",
    },
    format: ['cjs', 'esm'],
    external: ['react'],
    dts: true,
    sourcemap: true,
  },
  // RSC APIs - shared client
  {
    // Entry is `.mts` as the entrypoints that import it will be ESM so it needs exact imports that includes the `.mjs` extension.
    entry: ['rsc/rsc-shared.mts'],
    outDir: 'rsc/dist',
    format: ['esm'],
    external: ['react', 'zod'],
    dts: true,
    sourcemap: true,
  },
  // RSC APIs - server, client
  {
    entry: ['rsc/rsc-server.ts', 'rsc/rsc-client.ts'],
    outDir: 'rsc/dist',
    format: ['esm'],
    external: ['react', 'zod', /\/rsc-shared/],
    dts: true,
    sourcemap: true,
  },
  // RSC APIs - types
  {
    entry: ['rsc/index.ts'],
    outDir: 'rsc/dist',
    dts: true,
    outExtension() {
      return {
        // It must be `.d.ts` instead of `.d.mts` to support node resolution.
        // See https://github.com/vercel/ai/issues/1028.
        dts: '.d.ts',
        js: '.mjs',
      };
    },
  },
]);
