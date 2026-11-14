import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  /*
   * Kept as runtime node_modules: the Worlds must be one module instance per
   * process, Pi's model layer imports Node built-ins through variable
   * specifiers that a bundler cannot resolve, and libfx loads fx's native
   * engine at runtime.
   */
  serverExternalPackages: [
    '@workflow/world-local',
    '@workflow/world-vercel',
    '@vercel/sandbox',
    '@earendil-works/pi-ai',
    '@earendil-works/pi-agent-core',
    '@earendil-works/pi-coding-agent',
    'libfx',
  ],
};

export default nextConfig;
