import { describe, expect, it } from 'vitest';
import {
  AISDKError,
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
} from './index';

describe('DecisionUnsupportedQuestionTypeError', () => {
  const options = {
    questionId: 'requestsRefund',
    questionType: 'boolean',
    provider: 'test.decision',
    modelId: 'test-model',
  };

  it('identifies the unsupported question and model', () => {
    const error = new DecisionUnsupportedQuestionTypeError(options);

    expect(error).toBeInstanceOf(Error);
    expect(AISDKError.isInstance(error)).toBe(true);
    expect(DecisionUnsupportedQuestionTypeError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      ...options,
      name: 'AI_DecisionUnsupportedQuestionTypeError',
      message:
        'Question "requestsRefund" has type "boolean", which is not supported by provider "test.decision" and model "test-model".',
    });
  });

  it('accepts a provider-specific message', () => {
    const error = new DecisionUnsupportedQuestionTypeError({
      ...options,
      message: 'This model cannot return a probability for a boolean question.',
    });

    expect(error.message).toBe(
      'This model cannot return a probability for a boolean question.',
    );
  });

  it('recognizes the marker across package copies', () => {
    expect(
      DecisionUnsupportedQuestionTypeError.isInstance({
        [Symbol.for('vercel.ai.error.AI_DecisionUnsupportedQuestionTypeError')]:
          true,
      }),
    ).toBe(true);
  });

  it.each([
    null,
    undefined,
    'error',
    new Error('Unrelated error'),
    { name: 'AI_DecisionUnsupportedQuestionTypeError' },
    {
      [Symbol.for('vercel.ai.error.AI_DecisionUnsupportedQuestionTypeError')]:
        false,
    },
  ])('rejects values without the marker: %s', value => {
    expect(DecisionUnsupportedQuestionTypeError.isInstance(value)).toBe(false);
  });
});
