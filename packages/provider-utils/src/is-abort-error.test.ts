import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAbortError } from './is-abort-error';

describe('isAbortError', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true for recognized Error names', () => {
    for (const name of ['AbortError', 'ResponseAborted', 'TimeoutError']) {
      const error = new Error('request stopped');
      error.name = name;

      expect(isAbortError(error)).toBe(true);
    }
  });

  it('returns true for an abort DOMException', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isAbortError(new TypeError('some unrelated failure'))).toBe(false);
  });

  it('returns false when DOMException is not a constructor', () => {
    vi.stubGlobal('DOMException', undefined);

    expect(
      isAbortError({
        name: 'SomeUnrelatedFailure',
        message: 'some unrelated failure',
      }),
    ).toBe(false);
  });
});
