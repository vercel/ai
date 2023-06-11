import { defineConfig } from 'tsup'
import { readdirSync } from 'fs'

export default defineConfig([
  // Universal APIs
  {
    entry: ['streams/*.{ts,tsx}'],
    format: ['cjs', 'esm'],
    external: ['react', 'svelte'],
    dts: true
  },
  // React APIs
  {
    entry: ['react/*.{ts,tsx}'],
    outDir: 'react/dist',
    banner: {
      js: "'use client'"
    },
    format: ['cjs', 'esm'],
    external: ['react', 'svelte'],
    dts: true
  },
  // Svelte APIs
  {
    entry: ['svelte/*.{ts,tsx}'],
    outDir: 'svelte/dist',
    banner: {},
    format: ['cjs', 'esm'],
    external: ['react', 'svelte'],
    dts: true,
    // `sswr` has some issue with `.es.js` that can't be resolved correctly by
    // vite so we have to bundle it here.
    noExternal: ['sswr']
  }
])
