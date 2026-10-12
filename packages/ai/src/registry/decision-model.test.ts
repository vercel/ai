import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import {
  NoSuchModelError,
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
} from '@ai-sdk/provider';
import type { DecisionState } from '../decide/decision-state';
import { UnsupportedModelVersionError } from '../error/unsupported-model-version-error';
import { decide } from '../decide/decide';
import { resolveDecisionModel } from '../model/resolve-model';
import { DecisionMockModelV4 } from '../test/decision-mock-model-v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { MockProviderV2 } from '../test/mock-provider-v2';
import { MockProviderV3 } from '../test/mock-provider-v3';
import { MockProviderV4 } from '../test/mock-provider-v4';
import { MockVideoModelV4 } from '../test/mock-video-model-v4';
import { customProvider } from './custom-provider';
import { createProviderRegistry } from './provider-registry';
import { NoSuchProviderError } from './no-such-provider-error';

const model = new DecisionMockModelV4();

class DecisionTestProvider {
  readonly specificationVersion = 'v4';
  #model = model;
  #languageModel = new MockLanguageModelV4();

  languageModel(_modelId: string) {
    return this.#languageModel;
  }
  embeddingModel(): never {
    throw new Error('Not implemented');
  }
  imageModel(): never {
    throw new Error('Not implemented');
  }

  decisionModel(modelId: string) {
    expect(modelId).toBe('model:version');
    return this.#model;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('custom decision models', () => {
  it('resolves an alias before consulting the fallback', () => {
    const decisionModel = vi.fn();
    const provider = customProvider({
      decisionModels: { alias: model },
      fallbackProvider: Object.assign(new MockProviderV4(), {
        decisionModel,
      }),
    });
    expect(provider.decisionModel('alias')).toBe(model);
    expect(decisionModel).not.toHaveBeenCalled();
  });

  it('resolves string aliases through the configured default provider', () => {
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', new DecisionTestProvider());
    const provider = customProvider({
      decisionModels: { alias: 'model:version' },
    });
    expect(provider.decisionModel('alias')).toBe(model);
  });

  it('preserves the fallback receiver', () => {
    const provider = customProvider({
      fallbackProvider: new DecisionTestProvider(),
    });
    expect(provider.decisionModel('model:version')).toBe(model);
  });

  it.each([new MockProviderV2(), new MockProviderV3()])(
    'preserves experimental capabilities when adapting a legacy fallback',
    fallback => {
      const provider = Object.assign(fallback, {
        model,
        decisionModel() {
          return this.model;
        },
      });
      expect(
        customProvider({ fallbackProvider: provider }).decisionModel('model'),
      ).toBe(model);
    },
  );

  it.each(['missing', 'toString', 'constructor', '__proto__'])(
    'reports missing alias %s without treating inherited properties as models',
    modelId => {
      const decisionModels: Record<string, DecisionMockModelV4> = {
        known: model,
      };
      expect(() =>
        customProvider({ decisionModels }).decisionModel(modelId),
      ).toThrow(new NoSuchModelError({ modelId, modelType: 'decisionModel' }));
    },
  );

  it('reports an unavailable fallback model', () => {
    const fallbackProvider = Object.assign(new MockProviderV4(), {
      decisionModel: () => undefined as unknown as DecisionMockModelV4,
    });
    expect(() =>
      customProvider({ fallbackProvider }).decisionModel('missing'),
    ).toThrow(
      new NoSuchModelError({
        modelId: 'missing',
        modelType: 'decisionModel',
      }),
    );
  });
});

describe('decision registry', () => {
  it('preserves model identity, receiver, and colons inside model IDs', () => {
    const provider = new DecisionTestProvider();
    const registry = createProviderRegistry({ provider });
    expect(registry.decisionModel('provider:model:version')).toBe(model);
    expect(registry.languageModel('provider:language')).toBe(
      provider.languageModel('language'),
    );
  });

  it('preserves legacy provider extensions and custom separators', () => {
    const provider = Object.assign(new MockProviderV3(), {
      model,
      decisionModel(modelId: string) {
        expect(modelId).toBe('model::version');
        return this.model;
      },
    });
    const registry = createProviderRegistry({ provider }, { separator: '::' });
    expect(registry.decisionModel('provider::model::version')).toBe(model);
  });

  it('preserves deprecated factories when adapting a v3 provider', () => {
    const provider = Object.assign(new MockProviderV3(), {
      model,
      evaluationModel(modelId: string) {
        expect(modelId).toBe('model::version');
        return this.model;
      },
    });
    const registry = createProviderRegistry({ provider }, { separator: '::' });
    expect(registry.decisionModel('provider::model::version')).toBe(model);
    expect(registry.evaluationModel('provider::model::version')).toBe(model);
  });

  it('preserves deprecated factory receivers when adapting video models', () => {
    const videoModel = new MockVideoModelV4();
    class LegacyProvider extends MockProviderV4 {
      #model = model;
      #videoModel = videoModel;

      evaluationModel(modelId: string) {
        expect(modelId).toBe('model');
        return this.#model;
      }

      videoModel() {
        return this.#videoModel;
      }
    }
    const registry = createProviderRegistry({ provider: new LegacyProvider() });
    expect(registry.decisionModel('provider:model')).toBe(model);
    expect(registry.evaluationModel('provider:model')).toBe(model);
    expect(registry.videoModel('provider:video')).toBe(videoModel);
  });

  it('identifies unknown providers with the existing marker-based error', () => {
    const registry = createProviderRegistry({ known: new MockProviderV4() });
    try {
      // @ts-expect-error - deliberately unknown provider
      registry.decisionModel('missing:model');
      expect.fail('Expected missing-provider error');
    } catch (error) {
      expect(NoSuchProviderError.isInstance(error)).toBe(true);
      expect(NoSuchModelError.isInstance(error)).toBe(true);
      expect(error).toMatchObject({
        providerId: 'missing',
        modelType: 'decisionModel',
        availableProviders: ['known'],
      });
    }
  });

  it('reports malformed IDs', () => {
    const registry = createProviderRegistry({});
    // @ts-expect-error - deliberately malformed ID
    expect(() => registry.decisionModel('model')).toThrow(
      'must be in the format "providerId:modelId"',
    );
  });

  it.each([
    new MockProviderV4(),
    Object.assign(new MockProviderV4(), {
      decisionModel: () => null as unknown as DecisionMockModelV4,
    }),
  ])('reports missing decision capabilities or models', provider => {
    const registry = createProviderRegistry({ provider });
    expect(() => registry.decisionModel('provider:model')).toThrow(
      new NoSuchModelError({
        modelId: 'provider:model',
        modelType: 'decisionModel',
      }),
    );
  });
});

describe('decision model resolution', () => {
  const server = createTestServer({
    'https://ai-gateway.vercel.sh/v4/ai/decision-model': {
      response: {
        type: 'json-value',
        body: {
          answers: { correct: { type: 'boolean', probability: 0.98 } },
          usage: { inputTokens: 10, outputTokens: 2 },
          warnings: [],
        },
      },
    },
  });

  it('returns model instances unchanged', () => {
    expect(resolveDecisionModel(model)).toBe(model);
  });

  const gatewayStateCases: {
    name: string;
    state: DecisionState;
    expectedStateParts: DecisionModelV4State;
  }[] = [
    {
      name: 'string',
      state: 'The capital of France is Paris.',
      expectedStateParts: [
        { type: 'text', text: 'The capital of France is Paris.' },
      ],
    },
    {
      name: 'JSON object',
      state: { statement: 'The capital of France is Paris.' },
      expectedStateParts: [
        {
          type: 'json',
          value: { statement: 'The capital of France is Paris.' },
        },
      ],
    },
    {
      name: 'mixed parts',
      state: [
        { type: 'text', text: 'Check this statement.' },
        { type: 'json', value: { capital: 'Paris', country: 'France' } },
      ],
      expectedStateParts: [
        { type: 'text', text: 'Check this statement.' },
        { type: 'json', value: { capital: 'Paris', country: 'France' } },
      ],
    },
    { name: 'empty parts', state: [], expectedStateParts: [] },
  ];
  it.each(
    ['string', 'alias'].flatMap(resolution =>
      gatewayStateCases.map(test => ({ resolution, ...test })),
    ),
  )(
    'decides through Gateway using a model $resolution with $name state when no default provider is configured',
    async ({ resolution, state, expectedStateParts }) => {
      vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', undefined);
      vi.stubEnv('AI_GATEWAY_API_KEY', 'test-api-key');
      const modelId = 'typesafe-ai/jev';
      const questions = {
        correct: { type: 'boolean', instructions: 'Is this correct?' },
      } as const;

      const result = await decide({
        model:
          resolution === 'string'
            ? modelId
            : customProvider({
                decisionModels: { check: modelId },
              }).decisionModel('check'),
        state,
        questions,
      });

      expect(result.answers.correct.probability).toBe(0.98);
      expect(result.usage.totalTokens).toBe(12);
      expect(server.calls).toHaveLength(1);
      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-api-key',
        'ai-model-id': modelId,
        'ai-decision-model-specification-version': '4',
      });
      expect(await server.calls[0].requestBodyJson).toEqual({
        stateParts: expectedStateParts,
        questions,
        providerOptions: {},
      });
    },
  );

  it('requires an explicitly configured default provider to support decision', () => {
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', new MockProviderV4());
    expect(() => resolveDecisionModel('typesafe-ai/jev')).toThrow(
      'The default provider does not support decision models.',
    );
    expect(server.calls).toHaveLength(0);
  });

  it('validates versions returned by model instances, aliases, registries, and defaults', () => {
    const invalid = {
      ...model,
      specificationVersion: 'v3',
    } as unknown as DecisionMockModelV4;
    const provider = customProvider({ decisionModels: { invalid } });
    const registry = createProviderRegistry({ provider });
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', registry);
    for (const resolve of [
      () => resolveDecisionModel(invalid),
      () => provider.decisionModel('invalid'),
      () => registry.decisionModel('provider:invalid'),
      () => resolveDecisionModel('provider:invalid'),
    ])
      expect(resolve).toThrow(UnsupportedModelVersionError);
  });

  it('preserves errors thrown by provider factories', () => {
    const error = new NoSuchModelError({
      modelId: 'missing',
      modelType: 'decisionModel',
    });
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', {
      decisionModel() {
        throw error;
      },
    });
    expect(() => resolveDecisionModel('missing')).toThrow(error);
  });

  it('reports missing models returned by the default provider', () => {
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', {
      decisionModel: () => undefined,
    });
    expect(() => resolveDecisionModel('missing')).toThrow(
      new NoSuchModelError({
        modelId: 'missing',
        modelType: 'decisionModel',
      }),
    );
  });

  it.each(['instance', 'string'])(
    'decides with %s model resolution and forwards options in one call',
    async resolution => {
      const doDecide = vi.fn().mockResolvedValue({
        answers: { route: { type: 'choice', choice: 'billing' } },
        warnings: [],
        usage: { inputTokens: 10, outputTokens: 2 },
      });
      const provider = customProvider({
        decisionModels: { route: new DecisionMockModelV4({ doDecide }) },
      });
      vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', provider);
      const questions = {
        route: {
          type: 'choice',
          instructions: 'Team?',
          criteria: { billing: 'Charges', support: 'Other' },
        },
      } as const;
      const abortSignal = new AbortController().signal;
      const result = await decide({
        model:
          resolution === 'string'
            ? 'route'
            : createProviderRegistry({ provider }).decisionModel(
                'provider:route',
              ),
        state: { message: 'Charged twice' },
        questions,
        headers: { 'x-test': 'header' },
        providerOptions: { test: { flag: true } },
        abortSignal,
      });
      expect(result.answers.route.choice).toBe('billing');
      expect(result.usage.totalTokens).toBe(12);
      expect(doDecide).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          questions,
          abortSignal,
          headers: expect.objectContaining({ 'x-test': 'header' }),
          providerOptions: { test: { flag: true } },
        }),
      );
    },
  );

  it('rejects unsupported questions before I/O after resolving a string', async () => {
    const doDecide = vi.fn();
    const provider = customProvider({
      decisionModels: {
        choice: new DecisionMockModelV4({
          supportedQuestionTypes: ['choice'],
          doDecide,
        }),
      },
    });
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', provider);
    await expect(
      decide({
        model: 'choice',
        state: 'test',
        questions: { flag: { type: 'boolean', instructions: 'Yes?' } },
      }),
    ).rejects.toBeInstanceOf(DecisionUnsupportedQuestionTypeError);
    expect(doDecide).not.toHaveBeenCalled();
  });
});
