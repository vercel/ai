import { describe, expect, test } from 'vitest';
import { HarnessError } from './harness-error';
import { HarnessHistoryUnavailableError } from './harness-history-unavailable-error';

describe('HarnessHistoryUnavailableError', () => {
  test('is a HarnessError', () => {
    const err = new HarnessHistoryUnavailableError({
      message: 'The transcript store is inside a remote sandbox',
    });
    expect(HarnessError.isInstance(err)).toBe(true);
    expect(HarnessHistoryUnavailableError.isInstance(err)).toBe(true);
  });

  test('preserves the supplied message, harnessId, and cause', () => {
    const cause = new Error('ENOENT');
    const err = new HarnessHistoryUnavailableError({
      message: 'No transcript directory for this working directory',
      harnessId: 'claude-code',
      cause,
    });
    expect(err.message).toBe(
      'No transcript directory for this working directory',
    );
    expect(err.harnessId).toBe('claude-code');
    expect(err.cause).toBe(cause);
  });

  test('isInstance returns false for unrelated errors', () => {
    expect(HarnessHistoryUnavailableError.isInstance(new Error('x'))).toBe(
      false,
    );
    expect(HarnessHistoryUnavailableError.isInstance(null)).toBe(false);
  });
});
