import { describe, expect, it } from 'vitest';
import {
  AISDKError,
  Experimental_DecisionRefusalError as DecisionRefusalError,
} from './index';

describe('DecisionRefusalError', () => {
  const options = {
    questionIds: ['precursor'],
    provider: 'openai.decisions',
    modelId: 'gpt-6-luna',
  };

  it('identifies the refused questions and model', () => {
    const error = new DecisionRefusalError(options);

    expect(error).toBeInstanceOf(Error);
    expect(AISDKError.isInstance(error)).toBe(true);
    expect(DecisionRefusalError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      ...options,
      name: 'AI_DecisionRefusalError',
      message:
        'Decision model "gpt-6-luna" from provider "openai.decisions" refused question "precursor".',
    });
  });

  it('lists every refused question', () => {
    const error = new DecisionRefusalError({
      ...options,
      questionIds: ['precursor', 'yield'],
    });

    expect(error.message).toBe(
      'Decision model "gpt-6-luna" from provider "openai.decisions" refused questions "precursor", "yield".',
    );
  });

  it('preserves partial result data when provided', () => {
    const timestamp = new Date('2026-10-11T12:00:00Z');
    const error = new DecisionRefusalError({
      ...options,
      answers: {
        known: { type: 'boolean', probability: 0.9 },
      },
      usage: {
        inputTokens: 4,
        outputTokens: 2,
        totalTokens: 6,
      },
      warnings: [{ type: 'other', message: 'Provider note' }],
      rounding: { probabilityDecimals: 2 },
      providerMetadata: { test: { requestId: 'request-1' } },
      response: {
        id: 'response-1',
        timestamp,
        modelId: 'actual-model',
      },
    });

    expect(error).toMatchObject({
      answers: {
        known: { type: 'boolean', probability: 0.9 },
      },
      usage: {
        inputTokens: 4,
        outputTokens: 2,
        totalTokens: 6,
      },
      warnings: [{ type: 'other', message: 'Provider note' }],
      rounding: { probabilityDecimals: 2 },
      providerMetadata: { test: { requestId: 'request-1' } },
      response: {
        id: 'response-1',
        timestamp,
        modelId: 'actual-model',
      },
    });
  });

  it('recognizes the marker across package copies', () => {
    expect(
      DecisionRefusalError.isInstance({
        [Symbol.for('vercel.ai.error.AI_DecisionRefusalError')]: true,
      }),
    ).toBe(true);
  });

  it.each([
    null,
    undefined,
    new Error('Unrelated error'),
    { name: 'AI_DecisionRefusalError' },
  ])('rejects values without the marker: %s', value => {
    expect(DecisionRefusalError.isInstance(value)).toBe(false);
  });
});
