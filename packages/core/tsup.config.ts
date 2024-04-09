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
  {
    entry: ['prompts/index.ts'],
    format: ['cjs', 'esm'],
    external: ['react', 'svelte', 'vue'],
    outDir: 'prompts/dist',
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
    external: ['react', 'svelte', 'vue', 'solid-js'],
    dts: true,
    sourcemap: true,
  },
  {
    entry: ['react/index.server.ts'],
    outDir: 'react/dist',
    format: ['cjs', 'esm'],
    external: ['react', 'svelte', 'vue', 'solid-js'],
    dts: true,
    sourcemap: true,
  },
  // Svelte APIs
  {
    entry: ['svelte/index.ts'],
    outDir: 'svelte/dist',
    banner: {},
    format: ['cjs', 'esm'],
    external: ['react', 'svelte', 'vue', 'solid-js'],
    dts: true,
    sourcemap: true,
    // `sswr` has some issue with `.es.js` that can't be resolved correctly by
    // vite so we have to bundle it here.
    noExternal: ['sswr'],
  },
  // Vue APIs
  {
    entry: ['vue/index.ts'],
    outDir: 'vue/dist',
    banner: {},
    format: ['cjs', 'esm'],
    external: ['react', 'svelte', 'vue', 'solid-js'],
    dts: true,
    sourcemap: true,
  },
  // Solid APIs
  {
    entry: ['solid/index.ts'],
    outDir: 'solid/dist',
    banner: {},
    format: ['cjs', 'esm'],
    external: ['react', 'svelte', 'vue', 'solid-js'],
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

  // AI Core: Providers
  {
    entry: ['anthropic/index.ts'],
    format: ['cjs', 'esm'],
    outDir: 'anthropic/dist',
    dts: true,
    sourcemap: true,
  },
  {
    entry: ['google/index.ts'],
    format: ['cjs', 'esm'],
    outDir: 'google/dist',
    dts: true,
    sourcemap: true,
  },
  {
    entry: ['openai/index.ts'],
    format: ['cjs', 'esm'],
    outDir: 'openai/dist',
    dts: true,
    sourcemap: true,
  },
  {
    entry: ['mistral/index.ts'],
    format: ['cjs', 'esm'],
    outDir: 'mistral/dist',
    dts: true,
    sourcemap: true,
  },
  // AI Core: Model Specification
  {
    entry: ['spec/index.ts'],
    format: ['cjs', 'esm'],
    outDir: 'spec/dist',
    dts: true,
    sourcemap: true,
  },
]);
