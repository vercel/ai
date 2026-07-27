import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRuntimeEnvironmentUserAgent } from './get-runtime-environment-user-agent';

// Stabilize provider utils version used inside UA string construction
vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

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

  it('should sanitize slashes in userAgent for RFC 9110 compliance', () => {
    expect(
      getRuntimeEnvironmentUserAgent({
        navigator: {
          userAgent: 'Bun/1.3.9',
        },
      }),
    ).toBe('runtime/bun.1.3.9');
  });

  it('should sanitize Deno userAgent with multiple slashes', () => {
    expect(
      getRuntimeEnvironmentUserAgent({
        navigator: {
          userAgent: 'Deno/2.4.0',
        },
      }),
    ).toBe('runtime/deno.2.4.0');
  });

  it('should handle userAgent with no slashes', () => {
    expect(
      getRuntimeEnvironmentUserAgent({
        navigator: {
          userAgent: 'node',
        },
      }),
    ).toBe('runtime/node');
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
          version: 'test',
        },
      }),
    ).toBe('runtime/node.js/test');
  });
});
