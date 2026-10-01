import { expectTypeOf, it } from 'vitest';
import { DecisionMockModelV4 } from '../test/decision-mock-model-v4';
import {
  experimental_decide as decide,
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
