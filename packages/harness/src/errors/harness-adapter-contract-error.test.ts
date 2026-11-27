import { describe, expect, test } from 'vitest';
import { HarnessAdapterContractError } from './harness-adapter-contract-error';
import { HarnessError } from './harness-error';

describe('HarnessAdapterContractError', () => {
  test('is a HarnessError', () => {
    const error = new HarnessAdapterContractError({
      message: 'contract violation',
    });
    expect(HarnessError.isInstance(error)).toBe(true);
    expect(HarnessAdapterContractError.isInstance(error)).toBe(true);
    expect(error.name).toBe('AI_HarnessAdapterContractError');
  });

  test('preserves the supplied message and cause', () => {
    const cause = new Error('inner');
    const error = new HarnessAdapterContractError({
      message: 'invalid step number',
      cause,
    });
    expect(error.message).toBe('invalid step number');
    expect(error.cause).toBe(cause);
  });

  test('isInstance returns false for unrelated errors', () => {
    expect(HarnessAdapterContractError.isInstance(new Error('x'))).toBe(false);
    expect(HarnessAdapterContractError.isInstance(null)).toBe(false);
  });
});
