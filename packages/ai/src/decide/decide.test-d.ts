import {
  NoSuchModelError,
  type Experimental_DecisionModelV4CallOptions,
  type Experimental_DecisionModelV4StatePart,
  type Experimental_DecisionModelV4Question,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { DecisionMockModelV4 } from '../test/decision-mock-model-v4';
import {
  experimental_decide as decide,
  experimental_evaluate,
  type Experimental_EvaluationResult,
  customProvider,
  createProviderRegistry,
  type Experimental_DecisionState as DecisionState,
  type Experimental_DecisionStatePart as DecisionStatePart,
  type Experimental_DecisionQuestion as DecisionQuestion,
  type Experimental_DecisionQuestionInput as DecisionQuestionInput,
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
    state: [{ type: 'json', value: ['hello'] }] as const,
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

it('accepts public file conventions and keeps question JSON input separate', async () => {
  const state = [
    { type: 'text', text: 'Inspect.' },
    { type: 'json', value: [1, true, null] },
    { type: 'file', mediaType: 'image/png', data: new ArrayBuffer(4) },
    {
      type: 'file',
      mediaType: 'image/png',
      data: new URL('https://example.com/image.png'),
    },
    {
      type: 'file',
      mediaType: 'image/png',
      data: { type: 'data', data: new Uint8Array(4) },
    },
  ] as const satisfies readonly DecisionStatePart[];
  expectTypeOf(state).toExtend<DecisionState>();
  await decide({
    model: new DecisionMockModelV4(),
    state,
    questions: {
      visible: {
        type: 'boolean',
        instructions: ['Is the product visible?'],
        criteria: { true: ['visible'], false: ['hidden'] },
      },
    },
  });
  // @ts-expect-error JSON arrays require a json part or an object wrapper.
  const legacyArray: DecisionState = ['hello'];
  // @ts-expect-error File data needs a media type.
  const missingMediaType: DecisionStatePart = {
    type: 'file',
    data: new Uint8Array(4),
  };
  void legacyArray;
  void missingMediaType;
});

it('requires normalized parts at the provider boundary', () => {
  expectTypeOf<
    Experimental_DecisionModelV4CallOptions['state']
  >().toEqualTypeOf<readonly Experimental_DecisionModelV4StatePart[]>();
});

it('preserves literal Choice inference with public JSON instructions and criteria', async () => {
  const instructions = {
    task: ['Select a department'],
  } as const satisfies DecisionQuestionInput;
  const reusableQuestions = {
    department: {
      type: 'choice',
      instructions,
      criteria: {
        billing: { includes: ['charges'] },
        support: ['technical help'],
        other: null,
      },
    },
    urgent: {
      type: 'boolean',
      instructions: ['Is this urgent?'],
      criteria: { true: { severity: 'high' }, false: ['routine'] },
    },
  } as const satisfies Record<string, DecisionQuestion>;
  const result = await decide({
    model: new DecisionMockModelV4(),
    state: 'message',
    questions: reusableQuestions,
  });
  expectTypeOf(result.answers.department.choice).toEqualTypeOf<
    'billing' | 'support' | 'other'
  >();
  expectTypeOf(result.answers.department.probabilities).toEqualTypeOf<
    Record<'billing' | 'support' | 'other', number> | undefined
  >();
  expectTypeOf<
    Experimental_DecisionModelV4Question['instructions']
  >().toEqualTypeOf<string>();
  expectTypeOf<
    Extract<
      Experimental_DecisionModelV4Question,
      { type: 'choice' }
    >['criteria']
  >().toEqualTypeOf<Readonly<Record<string, string | null>>>();
  expectTypeOf<
    Extract<Experimental_DecisionModelV4Question, { type: 'score' }>['criteria']
  >().toEqualTypeOf<readonly (string | null)[]>();
  // @ts-expect-error Provider instructions must already be text.
  const providerQuestion: Experimental_DecisionModelV4Question =
    reusableQuestions.department;
  void providerQuestion;
});
