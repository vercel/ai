/** @type {import('next').NextConfig} */
const nextConfig = {
  // `ws` does a guarded `require('bufferutil')` for an optional native
  // addon used to mask large WebSocket frames. Next.js's bundler
  // replaces the `require` with a webpack stub that resolves to an
  // empty module instead of throwing, so the try/catch never falls
  // back to the JS implementation and frame masking blows up with
  // `bufferUtil.mask is not a function` on any payload ≥ 48 bytes.
  // `WS_NO_BUFFER_UTIL` tells `ws` itself to skip the optional require
  // entirely (verified in `node_modules/ws/lib/buffer-util.js`).
  env: {
    WS_NO_BUFFER_UTIL: '1',
  },
  /*
   * The Pi harness (`@ai-sdk/harness-pi`) runs the agent in-process, so its
   * dependency `@earendil-works/pi-coding-agent` (and transitively
   * `@earendil-works/pi-ai`) would otherwise be pulled into the server route
   * bundle. `@earendil-works/pi-ai` deliberately obfuscates its Node builtin
   * loads to dodge bundler static analysis — it concatenates the specifier
   * (`"node:" + "fs"`) and loads it through a dynamic `import(specifier)`.
   * Webpack cannot see the literal, so it compiles the call into a context
   * module with no Node builtins, and at runtime `import("node:fs")` (also
   * `node:os`, `node:path`) fails with `Cannot find module`. Externalizing the
   * package makes Node load it natively, where the dynamic import resolves
   * normally. This also requires `@earendil-works/pi-coding-agent` to be a
   * direct dependency of this app (not only a peer of `harness-pi`) so the
   * externalized import is resolvable from the app at runtime. Claude Code and
   * Codex avoid all of this because they run as sandbox subprocesses and are
   * never imported into the bundle.
   */
  serverExternalPackages: ['@earendil-works/pi-coding-agent'],
};

module.exports = nextConfig;
