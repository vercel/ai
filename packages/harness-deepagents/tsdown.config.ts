import { defineConfig } from 'tsdown';
import { removeDanglingDeclarationSourcemapComments } from '../../tools/tsdown/declaration-sourcemaps.mts';

const packageVersion = JSON.stringify(
  (await import('./package.json', { with: { type: 'json' } })).default.version,
);

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    outDir: 'dist',
    target: 'es2022',
    dts: {
      sourcemap: false,
    },
    outputOptions: {
      plugins: [removeDanglingDeclarationSourcemapComments()],
    },
    sourcemap: true,
    define: {
      __PACKAGE_VERSION__: packageVersion,
    },
    tsconfig: 'tsconfig.build.json',
    platform: 'node',
    clean: false,
    fixedExtension: false,
  },
  {
    entry: { 'bridge/index': 'src/bridge/index.ts' },
    format: ['esm'],
    outDir: 'dist',
    target: 'es2022',
    outExtensions: () => ({ js: '.mjs' }),
    dts: false,
    sourcemap: true,
    platform: 'node',
    // The shared bridge runtime (`@ai-sdk/harness/bridge`) must be INLINED —
    // the sandbox only installs the bridge's own deps (src/bridge/package.json),
    // so a bare import would not resolve there. The runtime SDKs the bridge
    // imports are installed in-sandbox and stay external.
    deps: {
      alwaysBundle: [/^@ai-sdk\/harness(?:\/|$)/],
      neverBundle: [
        /^deepagents(?:\/|$)/,
        /^@langchain\/anthropic(?:\/|$)/,
        /^@langchain\/core(?:\/|$)/,
        /^@langchain\/langgraph(?:\/|$)/,
        /^ws(?:\/|$)/,
        /^zod(?:\/|$)/,
      ],
    },
    define: {
      __PACKAGE_VERSION__: packageVersion,
    },
    tsconfig: 'tsconfig.build.json',
    clean: false,
    fixedExtension: false,
  },
]);
