import { expectTypeOf, it } from 'vitest';
import type {
  Experimental_DecisionModelV4 as DecisionModelV4,
  ProviderV4,
} from '@ai-sdk/provider';
import { decide } from '../decide/decide';
import type { Provider } from '../types/provider';
import type { DecisionModel } from '../decide/decision-result';
import { DecisionMockModelV4 } from '../test/decision-mock-model-v4';
import { MockProviderV4 } from '../test/mock-provider-v4';
import {
  createProviderRegistry,
  type ProviderRegistryProvider,
} from './provider-registry';
import { customProvider } from './custom-provider';

it('keeps experimental decision out of stable contracts', () => {
  expectTypeOf<'decisionModel'>().not.toExtend<keyof ProviderV4>();
  expectTypeOf<'decisionModel'>().not.toExtend<keyof Provider>();
  expectTypeOf<'decisionModel'>().not.toExtend<
    keyof ProviderRegistryProvider
  >();
});

it('infers aliases and returns v4 decision models', () => {
  const provider = customProvider({
    decisionModels: { route: new DecisionMockModelV4(), score: 'model-id' },
  });
  expectTypeOf<Parameters<typeof provider.decisionModel>[0]>().toEqualTypeOf<
    'route' | 'score'
  >();
  expectTypeOf(
    provider.decisionModel('route'),
  ).toEqualTypeOf<DecisionModelV4>();
  // @ts-expect-error - aliases are inferred
  provider.decisionModel('missing');

  const registry = createProviderRegistry(
    { custom: provider, other: new MockProviderV4() },
    { separator: '|' },
  );
  expectTypeOf(
    registry.decisionModel('custom|route'),
  ).toEqualTypeOf<DecisionModelV4>();
  // Model IDs remain extensible within a registered provider, like video.
  registry.decisionModel('custom|future-model');
  // @ts-expect-error - unregistered provider
  registry.decisionModel('missing|route');
  // @ts-expect-error - wrong separator
  registry.decisionModel('custom:route');
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
  const result = await decide({
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
  expectTypeOf<string>().toExtend<DecisionModel>();
});
