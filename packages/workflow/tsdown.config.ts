import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/video.ts'],
  format: ['esm'],
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  clean: false,
  dts: true,
  sourcemap: true,
  // Keep library target conservative for wide compatibility
  target: 'es2018',
  platform: 'node',
  define: {
    __PACKAGE_VERSION__: JSON.stringify(
      (await import('./package.json', { with: { type: 'json' } })).default
        .version,
    ),
  },
});
