/** @type {import('next').NextConfig} */
const nextConfig = {
  // `ws` (used by the harness bridge transport) does a guarded
  // `require('bufferutil')` for an optional native addon; Next's bundler stubs
  // the require, breaking frame masking. Tell `ws` to skip it entirely.
  env: {
    WS_NO_BUFFER_UTIL: '1',
  },
  /*
   * Packages the Workflow DevKit's bundler must NOT inline into its generated
   * step route, so Node resolves them natively at runtime:
   *
   *  - `@earendil-works/pi-coding-agent` — the in-process Pi harness; it loads
   *    Node builtins via concatenated specifiers the bundler can't analyze.
   *  - `@vercel/oidc` — pulled in transitively (every harness agent imports
   *    `@ai-sdk/harness/agent` → `ai` → `@ai-sdk/gateway`, which statically
   *    imports `@vercel/oidc`). The DevKit's esbuild otherwise inlines
   *    `@vercel/oidc`'s entry but leaves its internal `require('./get-vercel-oidc-token')`
   *    as a webpack context module that resolves to nothing at runtime
   *    (`Cannot find module '…/get-vercel-oidc-token.js'`), crashing the step
   *    route on load. Externalizing it keeps the require native, where it works.
   *
   * `serverExternalPackages` is forwarded into the DevKit's esbuild externals
   * (see `@workflow/next`), so it reaches the generated step/flow routes too.
   */
  serverExternalPackages: ['@earendil-works/pi-coding-agent', '@vercel/oidc'],
  /*
   * The Workflow DevKit's generated step route bundles the in-process Pi agent
   * (`@earendil-works/pi-coding-agent` → `pi-ai`), which loads Node builtins via
   * concatenated specifiers — `import("node:" + "fs")`, `"node:" + "os"`,
   * `"node:" + "path"` — to dodge bundler static analysis. Bundled, those become
   * unresolvable webpack context modules (`Cannot find module 'node:fs'`).
   *
   * `serverExternalPackages` alone doesn't keep them out of that route: the
   * packages are ESM-only (`"type": "module"`, an `exports` map with only an
   * `import` condition), and the DevKit bundles them anyway. This webpack hook
   * applies to every server compilation — including the generated step route —
   * and force-externalizes the whole `@earendil-works/*` scope as an `import`
   * (async) external so Node loads it natively, where the dynamic `node:`
   * imports resolve. It must be `import`, not `commonjs`: a CommonJS external
   * would make Node `require()` an ESM-only package and fail with
   * `No "exports" main defined`. The hook declines everything else, so
   * `serverExternalPackages` (e.g. `@vercel/oidc`) is unaffected.
   */
  webpack: config => {
    const externalizeEarendil = ({ request }, callback) => {
      if (request && request.startsWith('@earendil-works/')) {
        return callback(null, `import ${request}`);
      }
      return callback();
    };
    const existing = config.externals;
    config.externals = Array.isArray(existing)
      ? [externalizeEarendil, ...existing]
      : existing
        ? [externalizeEarendil, existing]
        : [externalizeEarendil];
    return config;
  },
};

// `withWorkflow` compiles the `'use workflow'` / `'use step'` directives.
const { withWorkflow } = require('workflow/next');

module.exports = withWorkflow(nextConfig, {});
