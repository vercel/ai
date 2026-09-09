import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';

type WebpackExternalCallback = (error?: Error | null, result?: string) => void;

const nextConfig: NextConfig = {
  // `ws` (used by the harness bridge transport) does a guarded
  // `require('bufferutil')` for an optional native addon; Next's bundler stubs
  // the require, breaking frame masking. Tell `ws` to skip it entirely.
  env: {
    WS_NO_BUFFER_UTIL: '1',
  },
  serverExternalPackages: [
    '@cline/agents',
    '@earendil-works/pi-coding-agent',
    '@vercel/oidc',
  ],
  webpack: config => {
    const externalizeHarnessDependencies = (
      { request }: { request?: string },
      callback: WebpackExternalCallback,
    ) => {
      if (
        request &&
        (request.startsWith('@cline/') ||
          request.startsWith('@earendil-works/'))
      ) {
        return callback(null, `import ${request}`);
      }
      return callback();
    };
    const existing = config.externals;
    config.externals = Array.isArray(existing)
      ? [externalizeHarnessDependencies, ...existing]
      : existing
        ? [externalizeHarnessDependencies, existing]
        : [externalizeHarnessDependencies];
    return config;
  },
};

export default withWorkflow(nextConfig, {});
