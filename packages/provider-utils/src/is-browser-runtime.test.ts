import { describe, it, expect } from 'vitest';
import { isBrowserRuntime } from './is-browser-runtime';

describe('isBrowserRuntime', () => {
  it('returns true when `window` is defined (browser)', () => {
    expect(isBrowserRuntime({ window: {} })).toBe(true);
  });

  it('returns false for server-like runtimes without `window`', () => {
    expect(isBrowserRuntime({})).toBe(false);
    expect(isBrowserRuntime({ navigator: { userAgent: 'cloudflare' } })).toBe(
      false,
    );
    expect(
      isBrowserRuntime({ process: { versions: { node: '22.0.0' } } }),
    ).toBe(false);
    expect(isBrowserRuntime({ EdgeRuntime: 'vercel' })).toBe(false);
  });
});
