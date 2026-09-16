import { describe, expect, it } from 'vitest';
import {
  AISDKError,
  Experimental_EvaluationUnsupportedQuestionTypeError as EvaluationUnsupportedQuestionTypeError,
} from './index';

describe('EvaluationUnsupportedQuestionTypeError', () => {
  const options = {
    questionId: 'requestsRefund',
    questionType: 'boolean',
    provider: 'test.evaluation',
    modelId: 'test-model',
  };

  it('identifies the unsupported question and model', () => {
    const error = new EvaluationUnsupportedQuestionTypeError(options);

    expect(error).toBeInstanceOf(Error);
    expect(AISDKError.isInstance(error)).toBe(true);
    expect(EvaluationUnsupportedQuestionTypeError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      ...options,
      name: 'AI_EvaluationUnsupportedQuestionTypeError',
      message:
        'Question "requestsRefund" has type "boolean", which is not supported by provider "test.evaluation" and model "test-model".',
    });
  });

  it('accepts a provider-specific message', () => {
    const error = new EvaluationUnsupportedQuestionTypeError({
      ...options,
      message: 'This model cannot return a probability for a boolean question.',
    });

    expect(error.message).toBe(
      'This model cannot return a probability for a boolean question.',
    );
  });

  it('recognizes the marker across package copies', () => {
    expect(
      EvaluationUnsupportedQuestionTypeError.isInstance({
        [Symbol.for(
          'vercel.ai.error.AI_EvaluationUnsupportedQuestionTypeError',
        )]: true,
      }),
    ).toBe(true);
  });

  it.each([
    null,
    undefined,
    'error',
    new Error('Unrelated error'),
    { name: 'AI_EvaluationUnsupportedQuestionTypeError' },
    {
      [Symbol.for('vercel.ai.error.AI_EvaluationUnsupportedQuestionTypeError')]:
        false,
    },
  ])('rejects values without the marker: %s', value => {
    expect(EvaluationUnsupportedQuestionTypeError.isInstance(value)).toBe(
      false,
    );
  });
});
