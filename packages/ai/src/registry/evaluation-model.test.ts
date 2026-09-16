import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NoSuchModelError,
  Experimental_EvaluationUnsupportedQuestionTypeError as EvaluationUnsupportedQuestionTypeError,
} from '@ai-sdk/provider';
import { UnsupportedModelVersionError } from '../error/unsupported-model-version-error';
import { evaluate } from '../evaluate/evaluate';
import { resolveEvaluationModel } from '../model/resolve-model';
import { EvaluationMockModelV4 } from '../test/evaluation-mock-model-v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { MockProviderV2 } from '../test/mock-provider-v2';
import { MockProviderV3 } from '../test/mock-provider-v3';
import { MockProviderV4 } from '../test/mock-provider-v4';
import { customProvider } from './custom-provider';
import { createProviderRegistry } from './provider-registry';
import { NoSuchProviderError } from './no-such-provider-error';

const model = new EvaluationMockModelV4();

class EvaluationTestProvider {
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

  evaluationModel(modelId: string) {
    expect(modelId).toBe('model:version');
    return this.#model;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('custom evaluation models', () => {
  it('resolves an alias before consulting the fallback', () => {
    const evaluationModel = vi.fn();
    const provider = customProvider({
      evaluationModels: { alias: model },
      fallbackProvider: Object.assign(new MockProviderV4(), {
        evaluationModel,
      }),
    });
    expect(provider.evaluationModel('alias')).toBe(model);
    expect(evaluationModel).not.toHaveBeenCalled();
  });

  it('resolves string aliases through the configured default provider', () => {
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', new EvaluationTestProvider());
    const provider = customProvider({
      evaluationModels: { alias: 'model:version' },
    });
    expect(provider.evaluationModel('alias')).toBe(model);
  });

  it('preserves the fallback receiver', () => {
    const provider = customProvider({
      fallbackProvider: new EvaluationTestProvider(),
    });
    expect(provider.evaluationModel('model:version')).toBe(model);
  });

  it.each([new MockProviderV2(), new MockProviderV3()])(
    'preserves experimental capabilities when adapting a legacy fallback',
    fallback => {
      const provider = Object.assign(fallback, {
        model,
        evaluationModel() {
          return this.model;
        },
      });
      expect(
        customProvider({ fallbackProvider: provider }).evaluationModel('model'),
      ).toBe(model);
    },
  );

  it.each(['missing', 'toString', 'constructor', '__proto__'])(
    'reports missing alias %s without treating inherited properties as models',
    modelId => {
      const evaluationModels: Record<string, EvaluationMockModelV4> = {
        known: model,
      };
      expect(() =>
        customProvider({ evaluationModels }).evaluationModel(modelId),
      ).toThrow(
        new NoSuchModelError({ modelId, modelType: 'evaluationModel' }),
      );
    },
  );

  it('reports an unavailable fallback model', () => {
    const fallbackProvider = Object.assign(new MockProviderV4(), {
      evaluationModel: () => undefined as unknown as EvaluationMockModelV4,
    });
    expect(() =>
      customProvider({ fallbackProvider }).evaluationModel('missing'),
    ).toThrow(
      new NoSuchModelError({
        modelId: 'missing',
        modelType: 'evaluationModel',
      }),
    );
  });
});

describe('evaluation registry', () => {
  it('preserves model identity, receiver, and colons inside model IDs', () => {
    const provider = new EvaluationTestProvider();
    const registry = createProviderRegistry({ provider });
    expect(registry.evaluationModel('provider:model:version')).toBe(model);
    expect(registry.languageModel('provider:language')).toBe(
      provider.languageModel('language'),
    );
  });

  it('preserves legacy provider extensions and custom separators', () => {
    const provider = Object.assign(new MockProviderV3(), {
      model,
      evaluationModel(modelId: string) {
        expect(modelId).toBe('model::version');
        return this.model;
      },
    });
    const registry = createProviderRegistry({ provider }, { separator: '::' });
    expect(registry.evaluationModel('provider::model::version')).toBe(model);
  });

  it('identifies unknown providers with the existing marker-based error', () => {
    const registry = createProviderRegistry({ known: new MockProviderV4() });
    try {
      // @ts-expect-error - deliberately unknown provider
      registry.evaluationModel('missing:model');
      expect.fail('Expected missing-provider error');
    } catch (error) {
      expect(NoSuchProviderError.isInstance(error)).toBe(true);
      expect(NoSuchModelError.isInstance(error)).toBe(true);
      expect(error).toMatchObject({
        providerId: 'missing',
        modelType: 'evaluationModel',
        availableProviders: ['known'],
      });
    }
  });

  it('reports malformed IDs', () => {
    const registry = createProviderRegistry({});
    // @ts-expect-error - deliberately malformed ID
    expect(() => registry.evaluationModel('model')).toThrow(
      'must be in the format "providerId:modelId"',
    );
  });

  it.each([
    new MockProviderV4(),
    Object.assign(new MockProviderV4(), {
      evaluationModel: () => null as unknown as EvaluationMockModelV4,
    }),
  ])('reports missing evaluation capabilities or models', provider => {
    const registry = createProviderRegistry({ provider });
    expect(() => registry.evaluationModel('provider:model')).toThrow(
      new NoSuchModelError({
        modelId: 'provider:model',
        modelType: 'evaluationModel',
      }),
    );
  });
});

describe('evaluation model resolution', () => {
  it('returns model instances unchanged', () => {
    expect(resolveEvaluationModel(model)).toBe(model);
  });

  it.each([undefined, new MockProviderV4()])(
    'requires an evaluation-capable default provider',
    provider => {
      vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', provider);
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      expect(() => resolveEvaluationModel('typesafe/jev-latest')).toThrow(
        'The default provider does not support evaluation models.',
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('validates versions returned by model instances, aliases, registries, and defaults', () => {
    const invalid = {
      ...model,
      specificationVersion: 'v3',
    } as unknown as EvaluationMockModelV4;
    const provider = customProvider({ evaluationModels: { invalid } });
    const registry = createProviderRegistry({ provider });
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', registry);
    for (const resolve of [
      () => resolveEvaluationModel(invalid),
      () => provider.evaluationModel('invalid'),
      () => registry.evaluationModel('provider:invalid'),
      () => resolveEvaluationModel('provider:invalid'),
    ])
      expect(resolve).toThrow(UnsupportedModelVersionError);
  });

  it('preserves errors thrown by provider factories', () => {
    const error = new NoSuchModelError({
      modelId: 'missing',
      modelType: 'evaluationModel',
    });
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', {
      evaluationModel() {
        throw error;
      },
    });
    expect(() => resolveEvaluationModel('missing')).toThrow(error);
  });

  it('reports missing models returned by the default provider', () => {
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', {
      evaluationModel: () => undefined,
    });
    expect(() => resolveEvaluationModel('missing')).toThrow(
      new NoSuchModelError({
        modelId: 'missing',
        modelType: 'evaluationModel',
      }),
    );
  });

  it.each(['instance', 'string'])(
    'evaluates with %s model resolution and forwards options in one call',
    async resolution => {
      const doEvaluate = vi.fn().mockResolvedValue({
        answers: { route: { type: 'choice', choice: 'billing' } },
        warnings: [],
        usage: { inputTokens: 10, outputTokens: 2 },
      });
      const provider = customProvider({
        evaluationModels: { route: new EvaluationMockModelV4({ doEvaluate }) },
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
      const result = await evaluate({
        model:
          resolution === 'string'
            ? 'route'
            : createProviderRegistry({ provider }).evaluationModel(
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
      expect(doEvaluate).toHaveBeenCalledExactlyOnceWith(
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
    const doEvaluate = vi.fn();
    const provider = customProvider({
      evaluationModels: {
        choice: new EvaluationMockModelV4({
          supportedQuestionTypes: ['choice'],
          doEvaluate,
        }),
      },
    });
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', provider);
    await expect(
      evaluate({
        model: 'choice',
        state: 'test',
        questions: { flag: { type: 'boolean', instructions: 'Yes?' } },
      }),
    ).rejects.toBeInstanceOf(EvaluationUnsupportedQuestionTypeError);
    expect(doEvaluate).not.toHaveBeenCalled();
  });
});
