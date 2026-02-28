import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stabilize provider utils version used inside UA string construction
vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

import { getRuntimeEnvironmentUserAgent } from './get-runtime-environment-user-agent';

describe('getRuntimeEnvironmentUserAgent', () => {
  it('should return the correct user agent for browsers', () => {
    expect(
      getRuntimeEnvironmentUserAgent({
        window: true,
      }),
    ).toBe('runtime/browser');
  });

  it('should return the correct user agent for test', () => {
    expect(
      getRuntimeEnvironmentUserAgent({
        navigator: {
          userAgent: 'test',
        },
      }),
    ).toBe('runtime/test');
  });

  it('should return RFC-compliant user agent for Bun', () => {
    expect(
      getRuntimeEnvironmentUserAgent({
        navigator: {
          userAgent: 'Bun/1.3.9',
        },
      }),
    ).toBe('runtime-bun/1.3.9');
  });

  it('should return RFC-compliant user agent for Deno', () => {
    expect(
      getRuntimeEnvironmentUserAgent({
        navigator: {
          userAgent: 'Deno/2.1.0',
        },
      }),
    ).toBe('runtime-deno/2.1.0');
  });

  it('should return the correct user agent for Edge Runtime', () => {
    expect(
      getRuntimeEnvironmentUserAgent({
        EdgeRuntime: true,
      }),
    ).toBe('runtime/vercel-edge');
  });

  it('should return the correct user agent for Node.js', () => {
    expect(
      getRuntimeEnvironmentUserAgent({
        process: {
          versions: { node: 'test' },
          version: 'v22.0.0',
        },
      }),
    ).toBe('runtime-node/v22.0.0');
  });
});
