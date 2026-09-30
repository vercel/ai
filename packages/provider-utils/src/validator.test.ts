import { describe, expect, it } from 'vitest';
import { asValidator } from './validator';

describe('asValidator', () => {
  it('should validate with callable standard schemas', async () => {
    class CallableStandardSchema {
      static readonly '~standard' = {
        version: 1 as const,
        vendor: 'effect',
        validate: (value: unknown) =>
          typeof value === 'object' &&
          value !== null &&
          'model' in value &&
          typeof value.model === 'string'
            ? { value: { model: value.model } }
            : { issues: [{ message: 'model must be a string' }] },
      };
    }

    const validator = asValidator(CallableStandardSchema);

    await expect(
      validator.validate?.({ model: 'test-model' }),
    ).resolves.toEqual({
      success: true,
      value: { model: 'test-model' },
    });
  });
});
