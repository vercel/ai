import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNodeRuntime } from './is-node-runtime';

describe('isNodeRuntime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects Node.js', () => {
    vi.stubGlobal('process', { release: { name: 'node' } });
    expect(isNodeRuntime()).toBe(true);
  });

  it.each([
    undefined,
    {},
    { env: {} },
    { release: {} },
    { release: { name: 'other' } },
  ])('returns false for a non-Node process global: %j', processGlobal => {
    vi.stubGlobal('process', processGlobal);
    expect(isNodeRuntime()).toBe(false);
  });
});
