import { expectTypeOf, it } from 'vitest';
import type {
  EvaluationFallbackCondition,
  GatewayEvaluationProviderOptions,
  GatewayModelFallback,
  GatewayProviderOptions,
} from './index';

it('types conditional evaluation model fallbacks', () => {
  type QuestionId = 'department' | 'requestsRefund' | 'severity';

  const confidence = {
    question: 'department',
    confidenceBelow: 0.6,
  } satisfies EvaluationFallbackCondition<QuestionId>;
  const probability = {
    question: 'requestsRefund',
    probabilityBetween: [0.4, 0.6],
  } satisfies EvaluationFallbackCondition<QuestionId>;
  const any = {
    any: [confidence, probability],
  } satisfies EvaluationFallbackCondition<QuestionId>;
  const all = {
    all: [confidence, probability],
  } satisfies EvaluationFallbackCondition<QuestionId>;
  const atLeast = {
    atLeast: {
      count: 2,
      conditions: [confidence, probability],
    },
  } satisfies EvaluationFallbackCondition<QuestionId>;
  const maximumDepth = {
    any: [
      {
        all: [
          {
            atLeast: {
              count: 1,
              conditions: [
                {
                  any: [confidence],
                },
              ],
            },
          },
        ],
      },
    ],
  } satisfies EvaluationFallbackCondition<QuestionId>;

  expectTypeOf({
    model: 'openai/gpt-5.6-sol',
    when: confidence,
  }).toMatchTypeOf<GatewayModelFallback<QuestionId>>();
  expectTypeOf({
    model: 'openai/gpt-5.6-sol',
    when: probability,
  }).toMatchTypeOf<GatewayModelFallback<QuestionId>>();
  expectTypeOf({ model: 'openai/gpt-5.6-sol', when: any }).toMatchTypeOf<
    GatewayModelFallback<QuestionId>
  >();
  expectTypeOf({ model: 'openai/gpt-5.6-sol', when: all }).toMatchTypeOf<
    GatewayModelFallback<QuestionId>
  >();
  expectTypeOf({ model: 'openai/gpt-5.6-sol', when: atLeast }).toMatchTypeOf<
    GatewayModelFallback<QuestionId>
  >();
  expectTypeOf({
    model: 'openai/gpt-5.6-sol',
    when: maximumDepth,
  }).toMatchTypeOf<GatewayModelFallback<QuestionId>>();

  const existingModels: string[] = [
    'openai/gpt-5.6-sol',
    'anthropic/claude-haiku-4.5',
  ];
  const existingOptions = {
    models: existingModels,
  } satisfies GatewayProviderOptions;
  expectTypeOf(existingOptions.models).toEqualTypeOf<string[]>();
  expectTypeOf<GatewayProviderOptions['models']>().toEqualTypeOf<
    string[] | undefined
  >();
  const existingEvaluationOptions = {
    models: existingModels,
    order: ['openai'],
  } satisfies GatewayEvaluationProviderOptions;
  void existingEvaluationOptions;

  const options = {
    models: [
      { model: 'openai/gpt-5.6-sol', when: any },
      'anthropic/claude-haiku-4.5',
    ],
    order: ['openai'],
    serviceOwnedOption: true,
  } satisfies GatewayEvaluationProviderOptions<QuestionId>;
  expectTypeOf(options).toMatchTypeOf<
    GatewayEvaluationProviderOptions<QuestionId>
  >();
  expectTypeOf<GatewayEvaluationProviderOptions['sort']>().toEqualTypeOf<
    GatewayProviderOptions['sort']
  >();

  const languageOptions: GatewayProviderOptions = {
    // @ts-expect-error Conditional fallbacks are only valid on evaluation requests.
    models: [{ model: 'openai/gpt-5.6-sol', when: confidence }],
  };
  const invalidEvaluationSort: GatewayEvaluationProviderOptions = {
    // @ts-expect-error Evaluation options keep the typed routing options.
    sort: 'latency',
  };

  // @ts-expect-error Conditional fallbacks require a model.
  const missingModel: GatewayModelFallback = {
    when: confidence,
  };
  const malformedBounds: EvaluationFallbackCondition = {
    question: 'requestsRefund',
    // @ts-expect-error Probability bounds require exactly two values.
    probabilityBetween: [0.4],
  };
  const invalidField: EvaluationFallbackCondition = {
    question: 'department',
    // @ts-expect-error Conditions use confidenceBelow, not confidenceAbove.
    confidenceAbove: 0.6,
  };
  // @ts-expect-error Combinators require at least one condition.
  const emptyAny: EvaluationFallbackCondition = { any: [] };
  const incompleteAtLeast: EvaluationFallbackCondition = {
    // @ts-expect-error atLeast requires conditions.
    atLeast: { count: 1 },
  };
  // @ts-expect-error Conditions cannot mix combinators.
  const mixedCombinators: EvaluationFallbackCondition = {
    all: [confidence],
    any: [confidence],
  };
  const mixedDirectAndCombinator: EvaluationFallbackCondition = {
    question: 'department',
    confidenceBelow: 0.6,
    // @ts-expect-error Direct conditions cannot include combinators.
    any: [confidence],
  };
  const unknownQuestion: EvaluationFallbackCondition<QuestionId> = {
    // @ts-expect-error The question ID must come from the configured question set.
    question: 'missing',
    confidenceBelow: 0.6,
  };
  const conditional = {
    model: 'openai/gpt-5.6-sol',
    when: confidence,
  };
  const conditionalAfterString: GatewayEvaluationProviderOptions = {
    // @ts-expect-error A conditional fallback must be the first models entry.
    models: ['anthropic/claude-haiku-4.5', conditional],
  };
  const multipleConditionals: GatewayEvaluationProviderOptions = {
    // @ts-expect-error models supports at most one conditional fallback.
    models: [conditional, conditional],
  };

  void languageOptions;
  void invalidEvaluationSort;
  void missingModel;
  void malformedBounds;
  void invalidField;
  void emptyAny;
  void incompleteAtLeast;
  void mixedCombinators;
  void mixedDirectAndCombinator;
  void unknownQuestion;
  void conditionalAfterString;
  void multipleConditionals;
});
