import { expectTypeOf, it } from 'vitest';
import type {
  Experimental_EvaluationModelV4 as EvaluationModelV4,
  ProviderV4,
} from '@ai-sdk/provider';
import { evaluate } from '../evaluate/evaluate';
import type { Provider } from '../types/provider';
import type { EvaluationModel } from '../evaluate/evaluation-result';
import { EvaluationMockModelV4 } from '../test/evaluation-mock-model-v4';
import { MockProviderV4 } from '../test/mock-provider-v4';
import {
  createProviderRegistry,
  type ProviderRegistryProvider,
} from './provider-registry';
import { customProvider } from './custom-provider';

it('keeps experimental evaluation out of stable contracts', () => {
  expectTypeOf<'evaluationModel'>().not.toExtend<keyof ProviderV4>();
  expectTypeOf<'evaluationModel'>().not.toExtend<keyof Provider>();
  expectTypeOf<'evaluationModel'>().not.toExtend<
    keyof ProviderRegistryProvider
  >();
});

it('infers aliases and returns v4 evaluation models', () => {
  const provider = customProvider({
    evaluationModels: { route: new EvaluationMockModelV4(), score: 'model-id' },
  });
  expectTypeOf<Parameters<typeof provider.evaluationModel>[0]>().toEqualTypeOf<
    'route' | 'score'
  >();
  expectTypeOf(
    provider.evaluationModel('route'),
  ).toEqualTypeOf<EvaluationModelV4>();
  // @ts-expect-error - aliases are inferred
  provider.evaluationModel('missing');

  const registry = createProviderRegistry(
    { custom: provider, other: new MockProviderV4() },
    { separator: '|' },
  );
  expectTypeOf(
    registry.evaluationModel('custom|route'),
  ).toEqualTypeOf<EvaluationModelV4>();
  // Model IDs remain extensible within a registered provider, like video.
  registry.evaluationModel('custom|future-model');
  // @ts-expect-error - unregistered provider
  registry.evaluationModel('missing|route');
  // @ts-expect-error - wrong separator
  registry.evaluationModel('custom:route');
  globalThis.AI_SDK_DEFAULT_PROVIDER = provider;
});

it('preserves question and Choice inference for string models and reused readonly questions', async () => {
  const questions = {
    route: {
      type: 'choice',
      instructions: 'Team?',
      criteria: { billing: null, support: null },
    },
    severity: {
      type: 'score',
      instructions: 'Impact?',
      criteria: ['Low', 'High'],
    },
  } as const;
  const result = await evaluate({
    model: 'provider:alias',
    state: 'message',
    questions,
  });
  expectTypeOf(result.answers.route.choice).toEqualTypeOf<
    'billing' | 'support'
  >();
  expectTypeOf(result.answers.severity.score).toEqualTypeOf<number>();
  expectTypeOf<keyof typeof result.answers>().toEqualTypeOf<
    'route' | 'severity'
  >();
  expectTypeOf<string>().toExtend<EvaluationModel>();
});
