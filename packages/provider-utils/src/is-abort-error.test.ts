import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAbortError } from './is-abort-error';

describe('isAbortError', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false for non-errors when DOMException is unavailable', () => {
    vi.stubGlobal('DOMException', undefined);

    expect(isAbortError({ name: 'AbortError' })).toBe(false);
  });
});
