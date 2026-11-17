import { describe, expect, test } from 'vitest';
import { HarnessCancellationError } from './harness-cancellation-error';
import { HarnessEffectError } from './harness-effect-error';
import { HarnessError } from './harness-error';

describe('HarnessCancellationError', () => {
  test('is a HarnessError', () => {
    const error = new HarnessCancellationError();
    expect(HarnessError.isInstance(error)).toBe(true);
    expect(HarnessCancellationError.isInstance(error)).toBe(true);
  });

  test('has a default message', () => {
    const error = new HarnessCancellationError();
    expect(error.message).toBe('The turn was cancelled.');
    expect(error.name).toBe('AI_HarnessCancellationError');
  });

  test('preserves the supplied message and cause', () => {
    const cause = new Error('aborted');
    const error = new HarnessCancellationError({ message: 'stopped', cause });
    expect(error.message).toBe('stopped');
    expect(error.cause).toBe(cause);
  });

  test('isInstance returns false for other errors', () => {
    expect(HarnessCancellationError.isInstance(new Error('x'))).toBe(false);
    expect(
      HarnessCancellationError.isInstance(
        new HarnessEffectError({ message: 'x' }),
      ),
    ).toBe(false);
    expect(HarnessCancellationError.isInstance(null)).toBe(false);
  });
});
