import { describe, expect, test } from 'vitest';
import type { HarnessV2EffectError } from '../v2/harness-v2-effect';
import { HarnessEffectError } from './harness-effect-error';
import { HarnessError } from './harness-error';

describe('HarnessEffectError', () => {
  test('is a HarnessError', () => {
    const error = new HarnessEffectError({ message: 'failed' });
    expect(HarnessError.isInstance(error)).toBe(true);
    expect(HarnessEffectError.isInstance(error)).toBe(true);
  });

  test('preserves the supplied message and cause', () => {
    const cause = new Error('inner');
    const error = new HarnessEffectError({ message: 'effect failed', cause });
    expect(error.message).toBe('effect failed');
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('AI_HarnessEffectError');
  });

  test('can be constructed from serializable effect error data', () => {
    const data: HarnessV2EffectError = { message: 'recorded failure' };
    expect(new HarnessEffectError(data).message).toBe('recorded failure');
  });

  test('isInstance returns false for unrelated errors', () => {
    expect(HarnessEffectError.isInstance(new Error('x'))).toBe(false);
    expect(HarnessEffectError.isInstance(null)).toBe(false);
  });
});
