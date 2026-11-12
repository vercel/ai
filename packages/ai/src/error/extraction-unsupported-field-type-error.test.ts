import { describe, expect, it } from 'vitest';
import {
  AISDKError,
  Experimental_ExtractionUnsupportedFieldTypeError as ExtractionUnsupportedFieldTypeError,
} from './index';

describe('ExtractionUnsupportedFieldTypeError', () => {
  const options = {
    fieldId: 'total',
    fieldType: 'number',
    provider: 'mock-provider',
    modelId: 'mock-model-id',
  };

  it('identifies the unsupported field and model', () => {
    const error = new ExtractionUnsupportedFieldTypeError(options);

    expect(error).toBeInstanceOf(Error);
    expect(AISDKError.isInstance(error)).toBe(true);
    expect(ExtractionUnsupportedFieldTypeError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      ...options,
      name: 'AI_ExtractionUnsupportedFieldTypeError',
      message:
        'Field "total" has type "number", which is not supported by provider "mock-provider" and model "mock-model-id".',
    });
  });

  it('recognizes the marker across package copies', () => {
    expect(
      ExtractionUnsupportedFieldTypeError.isInstance({
        [Symbol.for('vercel.ai.error.AI_ExtractionUnsupportedFieldTypeError')]:
          true,
      }),
    ).toBe(true);
  });

  it.each([
    null,
    undefined,
    new Error('Unrelated error'),
    { name: 'AI_ExtractionUnsupportedFieldTypeError' },
  ])('rejects values without the marker: %s', value => {
    expect(ExtractionUnsupportedFieldTypeError.isInstance(value)).toBe(false);
  });
});
