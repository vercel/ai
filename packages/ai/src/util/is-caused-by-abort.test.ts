import { describe, expect, it } from 'vitest';
import { isCausedByAbort } from './is-caused-by-abort';

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function timeoutError() {
  return new DOMException('The operation timed out.', 'TimeoutError');
}

function wrap(error: unknown, times = 1): unknown {
  let current = error;
  for (let i = 0; i < times; i++) {
    current = new Error('wrapped', { cause: current });
  }
  return current;
}

describe('isCausedByAbort', () => {
  it('should return true for an abort error', () => {
    expect(isCausedByAbort(abortError())).toBe(true);
  });

  it('should return true for a timeout error', () => {
    expect(isCausedByAbort(timeoutError())).toBe(true);
  });

  it('should return true for an abort error wrapped as the cause', () => {
    expect(isCausedByAbort(wrap(abortError()))).toBe(true);
  });

  it('should return true for a timeout error wrapped as the cause', () => {
    expect(isCausedByAbort(wrap(timeoutError()))).toBe(true);
  });

  it('should return true for an abort error nested 4 causes deep', () => {
    expect(isCausedByAbort(wrap(abortError(), 4))).toBe(true);
  });

  it('should return false for an abort error nested beyond the depth limit', () => {
    expect(isCausedByAbort(wrap(abortError(), 5))).toBe(false);
  });

  it('should return false for a regular error', () => {
    expect(isCausedByAbort(new Error('failed'))).toBe(false);
  });

  it('should return false for a regular error with a non-error cause', () => {
    expect(isCausedByAbort(new Error('failed', { cause: 'reason' }))).toBe(
      false,
    );
  });

  it('should return false for a cause cycle', () => {
    const error = new Error('failed') as Error & { cause?: unknown };
    error.cause = error;
    expect(isCausedByAbort(error)).toBe(false);
  });

  it('should return false for null and undefined', () => {
    expect(isCausedByAbort(null)).toBe(false);
    expect(isCausedByAbort(undefined)).toBe(false);
  });
});
