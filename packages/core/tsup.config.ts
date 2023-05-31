import { defineConfig } from 'tsup'
import { readdirSync } from 'fs'

export default defineConfig([
  // Universal APIs
  {
    entry: readdirSync('src')
      .filter(file => !file.startsWith('use-'))
      .map(file => `src/${file}`),
    format: ['cjs', 'esm'],
    external: ['react'],
    dts: true,
    esbuildOptions: options => {
      options.bundle = false
    }
  },
  // Client APIs
  {
    entry: ['src/use-*.ts'],
    banner: {
      js: "'use client'"
    },
    format: ['cjs', 'esm'],
    external: ['react'],
    dts: true,
    esbuildOptions: options => {
      options.bundle = false
    }
  }
])
