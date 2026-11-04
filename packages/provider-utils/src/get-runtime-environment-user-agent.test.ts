import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRuntimeEnvironmentUserAgent } from './get-runtime-environment-user-agent';

// Stabilize provider utils version used inside UA string construction
vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

describe('getRuntimeEnvironmentUserAgent', () => {
  it('should return the browser user agent', () => {
    expect(
      getRuntimeEnvironmentUserAgent({
        window: true,
        navigator: {
          userAgent: 'Mozilla/5.0',
        },
      }),
    ).toBe('mozilla/5.0');
  });

  it('should return the correct user agent for Edge Runtime', () => {
    expect(
      getRuntimeEnvironmentUserAgent({
        EdgeRuntime: true,
      }),
    ).toBe('vercel-edge');
  });

  it('should return the correct user agent for Node.js', () => {
    expect(
      getRuntimeEnvironmentUserAgent({
        process: {
          versions: { node: 'test' },
          version: 'test',
        },
      }),
    ).toBe('node.js/test');
  });

  it('should omit the runtime when it is unknown', () => {
    expect(getRuntimeEnvironmentUserAgent({})).toBe('');
  });
});
