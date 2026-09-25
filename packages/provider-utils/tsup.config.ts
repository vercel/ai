import { fileURLToPath } from 'node:url';
import { defineConfig, type Options } from 'tsup';

const packageVersion = (
  await import('./package.json', { with: { type: 'json' } })
).default.version;

export default defineConfig([
  ...(['node', 'portable'] as const).map(
    (runtime): Options => ({
      entry: {
        [runtime === 'node' ? 'index' : 'index.portable']: 'src/index.ts',
      },
      format: ['esm'],
      dts: runtime === 'node',
      sourcemap: true,
      platform: runtime === 'node' ? 'node' : 'browser',
      esbuildPlugins:
        runtime === 'portable'
          ? [
              {
                name: 'portable-download-transport',
                setup(build) {
                  build.onResolve({ filter: /^\.\/safe-node-fetch$/ }, () => ({
                    path: fileURLToPath(
                      new URL(
                        './src/safe-node-fetch.portable.ts',
                        import.meta.url,
                      ),
                    ),
                  }));
                },
              },
            ]
          : [],
      define: {
        __PACKAGE_VERSION__: JSON.stringify(packageVersion),
      },
    }),
  ),
  {
    entry: ['src/experimental-evaluation/index.ts'],
    outDir: 'dist/experimental-evaluation',
    format: ['esm'],
    dts: true,
    sourcemap: true,
    platform: 'node',
  },
  {
    entry: ['src/test/index.ts'],
    outDir: 'dist/test',
    format: ['esm'],
    dts: true,
    sourcemap: true,
    // Avoid bundling Chai and other test dependencies.
    platform: 'node',
    external: [
      'chai',
      'vitest',
      'vitest/*',
      'msw',
      'msw/*',
      '@vitest/*',
      'vitest/dist/*',
      'vitest/dist/chunks/*',
      'vitest/dist/node/*',
      'vitest/dist/node/chunks/*',
    ],
    define: {
      __PACKAGE_VERSION__: JSON.stringify(packageVersion),
    },
  },
]);
