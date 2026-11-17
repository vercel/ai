import { NoSuchModelError } from '@ai-sdk/provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnsupportedModelVersionError } from '../error/unsupported-model-version-error';
import { extract } from '../extract/extract';
import { resolveExtractionModel } from '../model/resolve-model';
import { ExtractionMockModelV4 } from '../test/extraction-mock-model-v4';
import { MockProviderV2 } from '../test/mock-provider-v2';
import { MockProviderV3 } from '../test/mock-provider-v3';
import { MockProviderV4 } from '../test/mock-provider-v4';
import { MockVideoModelV4 } from '../test/mock-video-model-v4';
import { customProvider } from './custom-provider';
import { NoSuchProviderError } from './no-such-provider-error';
import { createProviderRegistry } from './provider-registry';

const model = new ExtractionMockModelV4();

class ExtractionTestProvider extends MockProviderV4 {
  #model = model;

  extractionModel(modelId: string) {
    expect(modelId).toBe('model:version');
    return this.#model;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('custom extraction models', () => {
  it('resolves an alias before consulting the fallback', () => {
    const extractionModel = vi.fn();
    const provider = customProvider({
      extractionModels: { alias: model },
      fallbackProvider: Object.assign(new MockProviderV4(), {
        extractionModel,
      }),
    });
    expect(provider.extractionModel('alias')).toBe(model);
    expect(extractionModel).not.toHaveBeenCalled();
  });

  it('resolves string aliases through the configured default provider', () => {
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', new ExtractionTestProvider());
    const provider = customProvider({
      extractionModels: { alias: 'model:version' },
    });
    expect(provider.extractionModel('alias')).toBe(model);
  });

  it('preserves the fallback receiver', () => {
    const provider = customProvider({
      fallbackProvider: new ExtractionTestProvider(),
    });
    expect(provider.extractionModel('model:version')).toBe(model);
  });

  it.each([new MockProviderV2(), new MockProviderV3()])(
    'preserves extraction when adapting a legacy fallback',
    fallback => {
      const provider = Object.assign(fallback, {
        model,
        extractionModel() {
          return this.model;
        },
      });
      expect(
        customProvider({ fallbackProvider: provider }).extractionModel('model'),
      ).toBe(model);
    },
  );

  it.each(['missing', 'toString', 'constructor', '__proto__'])(
    'reports missing alias %s without treating inherited properties as models',
    modelId => {
      const extractionModels: Record<string, ExtractionMockModelV4> = {
        known: model,
      };
      expect(() =>
        customProvider({ extractionModels }).extractionModel(modelId),
      ).toThrow(
        new NoSuchModelError({ modelId, modelType: 'extractionModel' }),
      );
    },
  );

  it('reports an unavailable fallback model', () => {
    const fallbackProvider = Object.assign(new MockProviderV4(), {
      extractionModel: () => undefined as unknown as ExtractionMockModelV4,
    });
    expect(() =>
      customProvider({ fallbackProvider }).extractionModel('missing'),
    ).toThrow(
      new NoSuchModelError({
        modelId: 'missing',
        modelType: 'extractionModel',
      }),
    );
  });
});

describe('extraction registry', () => {
  it('preserves model identity, receiver, and colons inside model IDs', () => {
    const registry = createProviderRegistry({
      provider: new ExtractionTestProvider(),
    });
    expect(registry.extractionModel('provider:model:version')).toBe(model);
  });

  it('preserves legacy provider extensions and custom separators', () => {
    const provider = Object.assign(new MockProviderV3(), {
      model,
      extractionModel(modelId: string) {
        expect(modelId).toBe('model::version');
        return this.model;
      },
    });
    const registry = createProviderRegistry({ provider }, { separator: '::' });
    expect(registry.extractionModel('provider::model::version')).toBe(model);
  });

  it('preserves the receiver when adapting video models', () => {
    const videoModel = new MockVideoModelV4();
    class VideoProvider extends MockProviderV4 {
      #model = model;
      #videoModel = videoModel;

      extractionModel() {
        return this.#model;
      }

      videoModel() {
        return this.#videoModel;
      }
    }
    const registry = createProviderRegistry({ provider: new VideoProvider() });
    expect(registry.extractionModel('provider:model')).toBe(model);
    expect(registry.videoModel('provider:video')).toBe(videoModel);
  });

  it('identifies unknown providers with the existing marker-based error', () => {
    const registry = createProviderRegistry({ known: new MockProviderV4() });
    try {
      // @ts-expect-error - deliberately unknown provider
      registry.extractionModel('missing:model');
      expect.fail('Expected missing-provider error');
    } catch (error) {
      expect(NoSuchProviderError.isInstance(error)).toBe(true);
      expect(error).toMatchObject({
        providerId: 'missing',
        modelType: 'extractionModel',
        availableProviders: ['known'],
      });
    }
  });

  it('reports malformed IDs', () => {
    const registry = createProviderRegistry({});
    // @ts-expect-error - deliberately malformed ID
    expect(() => registry.extractionModel('model')).toThrow(
      'must be in the format "providerId:modelId"',
    );
  });

  it.each([
    new MockProviderV4(),
    Object.assign(new MockProviderV4(), {
      extractionModel: () => null as unknown as ExtractionMockModelV4,
    }),
  ])('reports missing extraction capabilities or models', provider => {
    const registry = createProviderRegistry({ provider });
    expect(() => registry.extractionModel('provider:model')).toThrow(
      new NoSuchModelError({
        modelId: 'provider:model',
        modelType: 'extractionModel',
      }),
    );
  });
});

describe('extraction model resolution', () => {
  it('returns model instances unchanged', () => {
    expect(resolveExtractionModel(model)).toBe(model);
  });

  it('reports that Gateway has no extraction models yet', () => {
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', undefined);
    expect(() => resolveExtractionModel('scaledown/extract')).toThrow(
      'The default provider does not support extraction models.',
    );
  });

  it('requires an explicitly configured default provider to support extraction', () => {
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', new MockProviderV4());
    expect(() => resolveExtractionModel('model')).toThrow(
      'The default provider does not support extraction models.',
    );
  });

  it('validates versions returned by model instances, aliases, registries, and defaults', () => {
    const invalid = {
      ...model,
      specificationVersion: 'v3',
    } as unknown as ExtractionMockModelV4;
    const provider = customProvider({ extractionModels: { invalid } });
    const registry = createProviderRegistry({ provider });
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', registry);
    for (const resolve of [
      () => resolveExtractionModel(invalid),
      () => provider.extractionModel('invalid'),
      () => registry.extractionModel('provider:invalid'),
      () => resolveExtractionModel('provider:invalid'),
    ]) {
      expect(resolve).toThrow(UnsupportedModelVersionError);
    }
  });

  it('preserves errors thrown by provider factories', () => {
    const error = new NoSuchModelError({
      modelId: 'missing',
      modelType: 'extractionModel',
    });
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', {
      extractionModel() {
        throw error;
      },
    });
    expect(() => resolveExtractionModel('missing')).toThrow(error);
  });

  it('reports missing models returned by the default provider', () => {
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', {
      extractionModel: () => undefined,
    });
    expect(() => resolveExtractionModel('missing')).toThrow(
      new NoSuchModelError({
        modelId: 'missing',
        modelType: 'extractionModel',
      }),
    );
  });

  it.each(['string', 'registry'])(
    'extracts with %s model resolution and forwards options in one call',
    async resolution => {
      const doExtract = vi
        .fn<ExtractionMockModelV4['doExtract']>()
        .mockResolvedValue({
          answers: { total: { type: 'number', value: 12 } },
          warnings: [],
          usage: { inputTokens: 10, outputTokens: 2 },
        });
      const provider = customProvider({
        extractionModels: { invoice: new ExtractionMockModelV4({ doExtract }) },
      });
      vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', provider);
      const fields = { total: { type: 'number' } } as const;
      const result = await extract({
        model:
          resolution === 'string'
            ? 'invoice'
            : createProviderRegistry({ provider }).extractionModel(
                'provider:invoice',
              ),
        state: 'Total: 12',
        fields,
        headers: { 'x-test': 'header' },
        providerOptions: { test: { flag: true } },
      });
      expect(result.answers.total.value).toBe(12);
      expect(result.usage.totalTokens).toBe(12);
      expect(doExtract).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          fields,
          headers: expect.objectContaining({ 'x-test': 'header' }),
          providerOptions: { test: { flag: true } },
        }),
      );
    },
  );
});
