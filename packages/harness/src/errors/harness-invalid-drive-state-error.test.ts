import { describe, expect, test } from 'vitest';
import { HarnessError } from './harness-error';
import { HarnessInvalidDriveStateError } from './harness-invalid-drive-state-error';

describe('HarnessInvalidDriveStateError', () => {
  test('is a HarnessError', () => {
    const error = new HarnessInvalidDriveStateError({ message: 'restart' });
    expect(HarnessError.isInstance(error)).toBe(true);
    expect(HarnessInvalidDriveStateError.isInstance(error)).toBe(true);
  });

  test('preserves the supplied message and cause', () => {
    const cause = new Error('inner');
    const error = new HarnessInvalidDriveStateError({
      message: 'invalid drive state',
      cause,
    });
    expect(error.message).toBe('invalid drive state');
    expect(error.cause).toBe(cause);
  });

  test('isInstance returns false for unrelated errors', () => {
    expect(HarnessInvalidDriveStateError.isInstance(new Error('x'))).toBe(
      false,
    );
    expect(HarnessInvalidDriveStateError.isInstance(null)).toBe(false);
  });
});
