import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts', 'src/video.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  // Keep library target conservative for wide compatibility
  platform: 'node',
  define: {
    __PACKAGE_VERSION__: JSON.stringify(
      (await import('./package.json', { with: { type: 'json' } })).default
        .version,
    ),
  },
  clean: false,
});
