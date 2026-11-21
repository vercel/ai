import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';

const nextConfig: NextConfig = {
  // `ws` (used by the harness bridge transport) does a guarded
  // `require('bufferutil')` for an optional native addon; Next's bundler stubs
  // the require, breaking frame masking. Tell `ws` to skip it entirely.
  env: {
    WS_NO_BUFFER_UTIL: '1',
  },
  transpilePackages: ['pi-mcp-adapter'],
  outputFileTracingIncludes: {
    '/**': [
      './agent/harness/acp-codex/bridge/package.json',
      './agent/harness/acp-codex/bridge/pnpm-lock.yaml',
    ],
  },
  serverExternalPackages: [
    'libfx',
    '@cline/agents',
    '@cline/core',
    '@earendil-works/pi-coding-agent',
    '@vercel/oidc',
  ],
};

export default withWorkflow(nextConfig, {});
