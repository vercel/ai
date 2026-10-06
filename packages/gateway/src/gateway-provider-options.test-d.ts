import { expectTypeOf, it } from 'vitest';
import type {
  DecisionFallbackCondition,
  GatewayModelFallback,
  GatewayProviderOptions,
} from './index';

it('types conditional decision model fallbacks', () => {
  type QuestionId = 'department' | 'requestsRefund' | 'severity';

  const confidence = {
    question: 'department',
    confidenceBelow: 0.6,
  } satisfies DecisionFallbackCondition<QuestionId>;
  const probability = {
    question: 'requestsRefund',
    probabilityBetween: [0.4, 0.6],
  } satisfies DecisionFallbackCondition<QuestionId>;
  const any = {
    any: [confidence, probability],
  } satisfies DecisionFallbackCondition<QuestionId>;
  const all = {
    all: [confidence, probability],
  } satisfies DecisionFallbackCondition<QuestionId>;
  const atLeast = {
    atLeast: {
      count: 2,
      conditions: [confidence, probability],
    },
  } satisfies DecisionFallbackCondition<QuestionId>;
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
  } satisfies DecisionFallbackCondition<QuestionId>;

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
  expectTypeOf<string[]>().toMatchTypeOf<
    NonNullable<GatewayProviderOptions['models']>
  >();

  const options = {
    models: [
      { model: 'openai/gpt-5.6-sol', when: any },
      'anthropic/claude-haiku-4.5',
    ],
    order: ['openai'],
    serviceOwnedOption: true,
  } satisfies GatewayProviderOptions<QuestionId>;
  expectTypeOf(options).toMatchTypeOf<GatewayProviderOptions<QuestionId>>();

  const untypedQuestions = {
    models: [{ model: 'openai/gpt-5.6-sol', when: confidence }],
  } satisfies GatewayProviderOptions;
  void untypedQuestions;

  const invalidSort: GatewayProviderOptions = {
    // @ts-expect-error Provider options keep the typed routing options.
    sort: 'latency',
  };
  const unknownFallbackQuestion: GatewayProviderOptions<QuestionId> = {
    models: [
      {
        model: 'openai/gpt-5.6-sol',
        // @ts-expect-error The question ID must come from the configured question set.
        when: { question: 'missing', confidenceBelow: 0.6 },
      },
    ],
  };

  // @ts-expect-error Conditional fallbacks require a model.
  const missingModel: GatewayModelFallback = {
    when: confidence,
  };
  const malformedBounds: DecisionFallbackCondition = {
    question: 'requestsRefund',
    // @ts-expect-error Probability bounds require exactly two values.
    probabilityBetween: [0.4],
  };
  const invalidField: DecisionFallbackCondition = {
    question: 'department',
    // @ts-expect-error Conditions use confidenceBelow, not confidenceAbove.
    confidenceAbove: 0.6,
  };
  // @ts-expect-error Combinators require at least one condition.
  const emptyAny: DecisionFallbackCondition = { any: [] };
  const incompleteAtLeast: DecisionFallbackCondition = {
    // @ts-expect-error atLeast requires conditions.
    atLeast: { count: 1 },
  };
  // @ts-expect-error Conditions cannot mix combinators.
  const mixedCombinators: DecisionFallbackCondition = {
    all: [confidence],
    any: [confidence],
  };
  const mixedDirectAndCombinator: DecisionFallbackCondition = {
    question: 'department',
    confidenceBelow: 0.6,
    // @ts-expect-error Direct conditions cannot include combinators.
    any: [confidence],
  };
  const anyChoiceOrScore = {
    confidenceBelow: 0.6,
  } satisfies DecisionFallbackCondition<QuestionId>;
  const anyBoolean = {
    probabilityBetween: [0.4, 0.6],
  } satisfies DecisionFallbackCondition<QuestionId>;
  const anyUnsure = {
    any: [anyChoiceOrScore, anyBoolean],
  } satisfies DecisionFallbackCondition<QuestionId>;
  expectTypeOf({
    model: 'openai/gpt-5.6-sol',
    when: anyUnsure,
  }).toMatchTypeOf<GatewayModelFallback<QuestionId>>();

  // @ts-expect-error A condition needs a check, not only a question.
  const questionOnly: DecisionFallbackCondition = { question: 'department' };

  const unknownQuestion: DecisionFallbackCondition<QuestionId> = {
    // @ts-expect-error The question ID must come from the configured question set.
    question: 'missing',
    confidenceBelow: 0.6,
  };
  const conditional = {
    model: 'openai/gpt-5.6-sol',
    when: confidence,
  };
  const conditionalAfterString: GatewayProviderOptions = {
    // @ts-expect-error A conditional fallback must be the first models entry.
    models: ['anthropic/claude-haiku-4.5', conditional],
  };
  const multipleConditionals: GatewayProviderOptions = {
    // @ts-expect-error models supports at most one conditional fallback.
    models: [conditional, conditional],
  };

  void invalidSort;
  void unknownFallbackQuestion;
  void missingModel;
  void malformedBounds;
  void invalidField;
  void emptyAny;
  void incompleteAtLeast;
  void mixedCombinators;
  void mixedDirectAndCombinator;
  void unknownQuestion;
  void questionOnly;
  void conditionalAfterString;
  void multipleConditionals;
});
