import { NoSuchModelError } from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { DecisionMockModelV4 } from '../test/decision-mock-model-v4';
import {
  experimental_decide as decide,
  experimental_evaluate,
  type Experimental_EvaluationResult,
  customProvider,
  createProviderRegistry,
  type Experimental_DecisionQuestion as DecisionQuestion,
  type Experimental_DecisionAnswer as DecisionAnswer,
} from '../index';

it('infers answer kinds and literal options from inline questions', async () => {
  const result = await decide({
    model: new DecisionMockModelV4(),
    state: { message: 'refund', history: ['hello'] },
    questions: {
      topic: {
        type: 'choice',
        instructions: 'Team?',
        criteria: { billing: null, support: { includes: ['help'] } },
      },
      severity: {
        type: 'score',
        instructions: 'Severity?',
        criteria: ['Low', 'High'],
      },
      refund: { type: 'boolean', instructions: 'Refund?' },
    },
  });
  expectTypeOf(result.answers.topic.choice).toEqualTypeOf<
    'billing' | 'support'
  >();
  expectTypeOf(result.answers.topic.probabilities).toEqualTypeOf<
    Record<'billing' | 'support', number> | undefined
  >();
  expectTypeOf(result.answers.severity.score).toEqualTypeOf<number>();
  expectTypeOf(result.answers.refund.probability).toEqualTypeOf<number>();
  // @ts-expect-error No unknown question IDs.
  result.answers.missing;
  // @ts-expect-error Boolean answers are probabilities, not selected labels.
  result.answers.refund.choice;
});

it('accepts readonly reusable definitions', async () => {
  const questions = {
    score: {
      type: 'score',
      instructions: { question: 'How severe?' },
      criteria: ['Low', 'High'],
    },
    choice: {
      type: 'choice',
      instructions: 'Category?',
      criteria: { a: null, b: null },
    },
  } as const satisfies Record<string, DecisionQuestion>;
  const result = await decide({
    model: new DecisionMockModelV4(),
    state: ['hello'] as const,
    questions,
  });
  expectTypeOf(result.answers.choice.choice).toEqualTypeOf<'a' | 'b'>();
});

it('distributes over dynamic question types', () => {
  expectTypeOf<DecisionAnswer<DecisionQuestion>>().toEqualTypeOf<
    | { type: 'choice'; choice: string; probabilities?: Record<string, number> }
    | { type: 'score'; score: number; probabilities?: Record<string, number> }
    | { type: 'boolean'; probability: number }
  >();
});

it('preserves inference through deprecated API and provider aliases', async () => {
  expectTypeOf(experimental_evaluate).toEqualTypeOf<typeof decide>();
  const provider = customProvider({
    evaluationModels: { route: new DecisionMockModelV4() },
  });
  expectTypeOf<
    Parameters<typeof provider.evaluationModel>[0]
  >().toEqualTypeOf<'route'>();
  // @ts-expect-error - deprecated aliases retain model ID inference
  provider.evaluationModel('missing');
  const registry = createProviderRegistry(
    { custom: provider },
    { separator: '|' },
  );
  registry.evaluationModel('custom|route');
  // @ts-expect-error - registered provider and separator are required
  registry.evaluationModel('missing|route');
  // @ts-expect-error - registered provider and separator are required
  registry.evaluationModel('custom:route');
  const questions = {
    route: {
      type: 'choice',
      instructions: 'Team?',
      criteria: { billing: null, support: null },
    },
  } as const;
  const result = await experimental_evaluate({
    model: provider.evaluationModel('route'),
    state: 'message',
    questions,
  });
  expectTypeOf(result.answers.route.choice).toEqualTypeOf<
    'billing' | 'support'
  >();
  expectTypeOf(result).toEqualTypeOf<
    Experimental_EvaluationResult<typeof questions>
  >();
});

it('accepts legacy model error construction', () => {
  new NoSuchModelError({ modelId: 'legacy', modelType: 'evaluationModel' });
});
