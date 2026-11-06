import type {
  Experimental_EvaluationModelV4,
  Experimental_DecisionModelV4Result,
} from '@ai-sdk/provider';
import { afterEach, expect, it, vi } from 'vitest';
import {
  experimental_decide,
  experimental_evaluate,
  customProvider,
  createProviderRegistry,
} from '../index';
import { DecisionMockModelV4 } from '../test/decision-mock-model-v4';
import { MockProviderV4 } from '../test/mock-provider-v4';
import type { Telemetry } from '../telemetry/telemetry';

const questions = {
  route: {
    type: 'choice',
    instructions: 'Team?',
    criteria: { billing: null, support: null },
  },
} as const;
const result: Experimental_DecisionModelV4Result = {
  answers: { route: { type: 'choice', choice: 'billing' } },
  warnings: [],
};

class LegacyModel implements Experimental_EvaluationModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider = 'legacy';
  readonly modelId = 'legacy-model';
  readonly supportedQuestionTypes = ['choice'] as const;
  #result = result;
  doEvaluate() {
    return Promise.resolve(this.#result);
  }
}
class LegacyProvider extends MockProviderV4 {
  #model = new LegacyModel();
  evaluationModel(modelId: string) {
    expect(modelId).toBe('model');
    return this.#model;
  }
}
afterEach(() => vi.unstubAllGlobals());

it('keeps the function alias and accepts existing model implementations', async () => {
  expect(experimental_evaluate).toBe(experimental_decide);
  const model = new LegacyModel();
  const doEvaluate = vi.spyOn(model, 'doEvaluate');
  const output = await experimental_evaluate({
    model,
    state: 'message',
    questions,
  });
  expect(output.answers).toEqual(result.answers);
  expect(doEvaluate).toHaveBeenCalledOnce();
});

it('resolves deprecated provider factories through default, custom, and registry access', async () => {
  const legacy = new LegacyProvider();
  vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', legacy);
  const registry = createProviderRegistry({ legacy }, { separator: '|' });
  const custom = customProvider({ fallbackProvider: legacy });
  const aliases = customProvider({
    evaluationModels: { alias: new LegacyModel() },
  });
  for (const model of [
    'model',
    registry.evaluationModel('legacy|model'),
    registry.decisionModel('legacy|model'),
    custom.evaluationModel('model'),
    custom.decisionModel('model'),
    aliases.evaluationModel('alias'),
    aliases.decisionModel('alias'),
  ]) {
    expect(
      (await experimental_decide({ model, state: 'message', questions }))
        .answers,
    ).toEqual(result.answers);
  }
  expect(
    (
      await registry
        .evaluationModel('legacy|model')
        .doEvaluate({ state: [{ type: 'text', text: 'message' }], questions })
    ).answers,
  ).toEqual(result.answers);
});

it('prefers new model maps and factories and supports direct deprecated model calls', async () => {
  const model = new DecisionMockModelV4({ doDecide: async () => result });
  const deprecated = vi.fn();
  const provider = customProvider({
    decisionModels: { alias: model },
    evaluationModels: { alias: new LegacyModel() },
  });
  expect(provider.decisionModel('alias')).toBe(model);
  expect(
    (
      await provider
        .evaluationModel('alias')
        .doEvaluate({ state: [{ type: 'text', text: 'message' }], questions })
    ).answers,
  ).toEqual(result.answers);
  vi.stubGlobal(
    'AI_SDK_DEFAULT_PROVIDER',
    Object.assign(new MockProviderV4(), {
      decisionModel: () => model,
      evaluationModel: deprecated,
    }),
  );
  await experimental_evaluate({ model: 'model', state: 'message', questions });
  expect(deprecated).not.toHaveBeenCalled();
});

it('dispatches deprecated telemetry callbacks once with decision operation names', async () => {
  const callbacks = {
    experimental_onEvaluateStart: vi.fn(),
    experimental_onEvaluationModelCallStart: vi.fn(),
    experimental_onEvaluationModelCallEnd: vi.fn(),
    experimental_onEvaluateEnd: vi.fn(),
  } satisfies Telemetry;
  await experimental_evaluate({
    model: new LegacyModel(),
    state: 'message',
    questions,
    telemetry: { integrations: [callbacks] },
  });
  for (const [name, callback] of Object.entries(callbacks)) {
    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0].operationId).toBe(
      name.includes('ModelCall') ? 'ai.decide.doDecide' : 'ai.decide',
    );
  }
});

it('prefers each decision telemetry callback over its deprecated alias', async () => {
  const deprecated = vi.fn();
  const current = vi.fn();
  await experimental_evaluate({
    model: new LegacyModel(),
    state: 'message',
    questions,
    telemetry: {
      integrations: [
        {
          experimental_onDecideStart: current,
          experimental_onEvaluateStart: deprecated,
          experimental_onDecisionModelCallStart: current,
          experimental_onEvaluationModelCallStart: deprecated,
          experimental_onDecisionModelCallEnd: current,
          experimental_onEvaluationModelCallEnd: deprecated,
          experimental_onDecideEnd: current,
          experimental_onEvaluateEnd: deprecated,
        },
      ],
    },
  });
  expect(current).toHaveBeenCalledTimes(4);
  expect(deprecated).not.toHaveBeenCalled();
});
