import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import {
  EVALUATION_FALLBACK_MAX_CONDITION_DEPTH,
  EVALUATION_FALLBACK_MAX_CONDITIONS_PER_LIST,
  EVALUATION_FALLBACK_MAX_MODEL_LENGTH,
  EVALUATION_FALLBACK_MAX_QUESTION_LENGTH,
  gatewayEvaluationProviderOptionsSchema,
} from './gateway-provider-options';

const conditionalFallback = {
  model: 'openai/gpt-5.6-sol',
  when: { question: 'intent', confidenceBelow: 0.6 },
};

describe('gatewayEvaluationProviderOptionsSchema', () => {
  it.each([
    { question: 'intent', confidenceBelow: 0.6 },
    { question: 'refunded', probabilityBetween: [0.4, 0.6] },
    {
      any: [
        { question: 'intent', confidenceBelow: 0.6 },
        { question: 'refunded', probabilityBetween: [0.4, 0.6] },
      ],
    },
    {
      all: [
        { question: 'intent', confidenceBelow: 0.6 },
        { question: 'severity', confidenceBelow: 0.7 },
      ],
    },
    {
      atLeast: {
        count: 2,
        conditions: [
          { question: 'intent', confidenceBelow: 0.6 },
          { question: 'refunded', probabilityBetween: [0.4, 0.6] },
          { question: 'severity', confidenceBelow: 0.7 },
        ],
      },
    },
  ])('accepts condition %#', async when => {
    const result = await safeValidateTypes({
      value: {
        models: [{ model: 'openai/gpt-5.6-sol', when }],
      },
      schema: gatewayEvaluationProviderOptionsSchema,
    });

    expect(result.success).toBe(true);
  });

  it('keeps existing string fallback lists and service-owned options valid', async () => {
    const value = {
      models: ['openai/gpt-5.6-sol', 'anthropic/claude-sonnet-5'],
      serviceOwnedOption: true,
    };
    const result = await safeValidateTypes({
      value,
      schema: gatewayEvaluationProviderOptionsSchema,
    });

    expect(result).toMatchObject({ success: true, value });
  });

  it('accepts one conditional entry followed by string error fallbacks', async () => {
    const result = await safeValidateTypes({
      value: {
        models: [conditionalFallback, 'anthropic/claude-sonnet-5'],
      },
      schema: gatewayEvaluationProviderOptionsSchema,
    });

    expect(result.success).toBe(true);
  });

  it.each([
    { question: '', confidenceBelow: 0.5 },
    { question: 'intent', confidenceBelow: Number.NaN },
    { question: 'intent', confidenceBelow: Number.POSITIVE_INFINITY },
    { question: 'intent', confidenceBelow: -0.1 },
    { question: 'intent', confidenceBelow: 1.1 },
    { question: 'refunded', probabilityBetween: [0.7, 0.3] },
    { question: 'refunded', probabilityBetween: [0, 1, 2] },
    { any: [] },
    { all: [] },
    {
      atLeast: {
        count: 0,
        conditions: [{ question: 'intent', confidenceBelow: 0.5 }],
      },
    },
    {
      atLeast: {
        count: 1.5,
        conditions: [{ question: 'intent', confidenceBelow: 0.5 }],
      },
    },
    {
      atLeast: {
        count: 2,
        conditions: [{ question: 'intent', confidenceBelow: 0.5 }],
      },
    },
    {
      question: 'intent',
      confidenceBelow: 0.5,
      probabilityBetween: [0.4, 0.6],
    },
    {
      question: 'intent',
      confidenceBelow: 0.5,
      any: [{ question: 'severity', confidenceBelow: 0.7 }],
    },
    { question: 'intent', confidenceBelow: 0.5, extra: true },
  ])('rejects condition %#', async when => {
    const result = await safeValidateTypes({
      value: {
        models: [{ model: 'openai/gpt-5.6-sol', when }],
      },
      schema: gatewayEvaluationProviderOptionsSchema,
    });

    expect(result.success).toBe(false);
  });

  it('enforces the maximum condition depth', async () => {
    let condition: unknown = { question: 'intent', confidenceBelow: 0.5 };
    for (
      let depth = 1;
      depth < EVALUATION_FALLBACK_MAX_CONDITION_DEPTH;
      depth++
    ) {
      condition = { any: [condition] };
    }

    const validResult = await safeValidateTypes({
      value: {
        models: [{ model: 'openai/gpt-5.6-sol', when: condition }],
      },
      schema: gatewayEvaluationProviderOptionsSchema,
    });
    const invalidResult = await safeValidateTypes({
      value: {
        models: [{ model: 'openai/gpt-5.6-sol', when: { any: [condition] } }],
      },
      schema: gatewayEvaluationProviderOptionsSchema,
    });

    expect(validResult.success).toBe(true);
    expect(invalidResult.success).toBe(false);
  });

  it('accepts five condition levels and rejects six', async () => {
    const direct = { question: 'intent', confidenceBelow: 0.5 };
    const fiveLevels = {
      any: [
        {
          all: [
            {
              atLeast: {
                count: 1,
                conditions: [{ any: [direct] }],
              },
            },
          ],
        },
      ],
    };
    const sixLevels = { any: [fiveLevels] };

    const validResult = await safeValidateTypes({
      value: {
        models: [{ model: 'openai/gpt-5.6-sol', when: fiveLevels }],
      },
      schema: gatewayEvaluationProviderOptionsSchema,
    });
    const invalidResult = await safeValidateTypes({
      value: {
        models: [{ model: 'openai/gpt-5.6-sol', when: sixLevels }],
      },
      schema: gatewayEvaluationProviderOptionsSchema,
    });

    expect(validResult.success).toBe(true);
    expect(invalidResult.success).toBe(false);
    expect(
      invalidResult.success ? undefined : invalidResult.error.message,
    ).toContain(
      `conditions can be nested at most ${EVALUATION_FALLBACK_MAX_CONDITION_DEPTH} levels deep`,
    );
  });

  it.each([
    {
      models: [
        { model: '', when: { question: 'intent', confidenceBelow: 0.6 } },
      ],
    },
    { models: [conditionalFallback, conditionalFallback] },
    { models: ['anthropic/claude-sonnet-5', conditionalFallback] },
  ])('rejects invalid models list %#', async ({ models }) => {
    const result = await safeValidateTypes({
      value: { models },
      schema: gatewayEvaluationProviderOptionsSchema,
    });

    expect(result.success).toBe(false);
  });

  it('applies the shared condition and model bounds', () => {
    expect({
      depth: EVALUATION_FALLBACK_MAX_CONDITION_DEPTH,
      conditionsPerList: EVALUATION_FALLBACK_MAX_CONDITIONS_PER_LIST,
      questionLength: EVALUATION_FALLBACK_MAX_QUESTION_LENGTH,
      modelLength: EVALUATION_FALLBACK_MAX_MODEL_LENGTH,
    }).toEqual({
      depth: 5,
      conditionsPerList: 20,
      questionLength: 256,
      modelLength: 256,
    });
  });

  it.each([
    { length: EVALUATION_FALLBACK_MAX_QUESTION_LENGTH, success: true },
    { length: EVALUATION_FALLBACK_MAX_QUESTION_LENGTH + 1, success: false },
  ])('bounds question length at $length', async ({ length, success }) => {
    const result = await safeValidateTypes({
      value: {
        models: [
          {
            model: 'openai/gpt-5.6-sol',
            when: { question: 'q'.repeat(length), confidenceBelow: 0.6 },
          },
        ],
      },
      schema: gatewayEvaluationProviderOptionsSchema,
    });

    expect(result.success).toBe(success);
  });

  it.each([
    { length: EVALUATION_FALLBACK_MAX_MODEL_LENGTH, success: true },
    { length: EVALUATION_FALLBACK_MAX_MODEL_LENGTH + 1, success: false },
  ])(
    'bounds conditional model length at $length',
    async ({ length, success }) => {
      const result = await safeValidateTypes({
        value: {
          models: [{ ...conditionalFallback, model: 'm'.repeat(length) }],
        },
        schema: gatewayEvaluationProviderOptionsSchema,
      });

      expect(result.success).toBe(success);
    },
  );

  it.each([
    {
      name: 'any',
      when: (conditions: unknown[]) => ({ any: conditions }),
    },
    {
      name: 'all',
      when: (conditions: unknown[]) => ({ all: conditions }),
    },
    {
      name: 'atLeast',
      when: (conditions: unknown[]) => ({
        atLeast: { count: 1, conditions },
      }),
    },
  ])('bounds $name condition lists', async ({ when }) => {
    const conditions = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        question: `question${index}`,
        confidenceBelow: 0.6,
      }));
    const validate = (count: number) =>
      safeValidateTypes({
        value: {
          models: [
            { model: 'openai/gpt-5.6-sol', when: when(conditions(count)) },
          ],
        },
        schema: gatewayEvaluationProviderOptionsSchema,
      });

    expect(
      (await validate(EVALUATION_FALLBACK_MAX_CONDITIONS_PER_LIST)).success,
    ).toBe(true);
    expect(
      (await validate(EVALUATION_FALLBACK_MAX_CONDITIONS_PER_LIST + 1)).success,
    ).toBe(false);
  });
});
