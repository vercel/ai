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
    // the sandbox only installs the bridge's own deps, so a bare import would
    // not resolve there. tsdown externalizes package.json deps by default, hence
    // the explicit override.
    // SDK + MCP deps live inside the sandbox-installed node_modules; never
    // bundle them into bridge.mjs. ws and zod are also installed by the
    // bridge's pnpm install step so the host package's own copy is irrelevant.
    deps: {
      alwaysBundle: [/^@ai-sdk\/harness(?:\/|$)/],
      neverBundle: [
        /^@anthropic-ai\/claude-agent-sdk(?:\/|$)/,
        /^@anthropic-ai\/claude-code(?:\/|$)/,
        /^@modelcontextprotocol\/sdk(?:\/|$)/,
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
