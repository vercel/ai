import { describe, expect, it } from 'vitest';
import {
  AISDKError,
  Experimental_ExtractionRefusalError as ExtractionRefusalError,
} from './index';

describe('ExtractionRefusalError', () => {
  const options = {
    fieldIds: ['total'],
    provider: 'mock-provider',
    modelId: 'mock-model-id',
  };

  it('identifies the refused fields and model', () => {
    const error = new ExtractionRefusalError(options);

    expect(error).toBeInstanceOf(Error);
    expect(AISDKError.isInstance(error)).toBe(true);
    expect(ExtractionRefusalError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      ...options,
      name: 'AI_ExtractionRefusalError',
      message:
        'Extraction model "mock-model-id" from provider "mock-provider" refused field "total".',
    });
  });

  it('lists every refused field', () => {
    const error = new ExtractionRefusalError({
      ...options,
      fieldIds: ['total', 'dueDate'],
    });

    expect(error.message).toBe(
      'Extraction model "mock-model-id" from provider "mock-provider" refused fields "total", "dueDate".',
    );
  });

  it('recognizes the marker across package copies', () => {
    expect(
      ExtractionRefusalError.isInstance({
        [Symbol.for('vercel.ai.error.AI_ExtractionRefusalError')]: true,
      }),
    ).toBe(true);
  });

  it.each([
    null,
    undefined,
    new Error('Unrelated error'),
    { name: 'AI_ExtractionRefusalError' },
  ])('rejects values without the marker: %s', value => {
    expect(ExtractionRefusalError.isInstance(value)).toBe(false);
  });
});
