import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { MockImageModelV3 } from '../test/mock-image-model-v3';
import { MockProviderV2 } from '../test/mock-provider-v2';
import { MockProviderV3 } from '../test/mock-provider-v3';
import { wrapProvider } from './wrap-provider';
import { describe, it, expect, vi } from 'vitest';

describe('wrapProvider', () => {
  it('should wrap all language models in the provider', () => {
    const model1 = new MockLanguageModelV3({ modelId: 'model-1' });
    const model2 = new MockLanguageModelV3({ modelId: 'model-2' });
    const model3 = new MockLanguageModelV3({ modelId: 'model-3' });

    const provider = new MockProviderV3({
      languageModels: {
        'model-1': model1,
        'model-2': model2,
        'model-3': model3,
      },
    });

    const overrideModelId = vi
      .fn()
      .mockImplementation(({ model }) => `override-${model.modelId}`);

    const wrappedProvider = wrapProvider({
      provider,
      languageModelMiddleware: {
        specificationVersion: 'v3',
        overrideModelId,
      },
    });

    expect(wrappedProvider.languageModel('model-1').modelId).toBe(
      'override-model-1',
    );
    expect(wrappedProvider.languageModel('model-2').modelId).toBe(
      'override-model-2',
    );
    expect(wrappedProvider.languageModel('model-3').modelId).toBe(
      'override-model-3',
    );

    expect(overrideModelId).toHaveBeenCalledTimes(3);
    expect(overrideModelId).toHaveBeenCalledWith({ model: model1 });
    expect(overrideModelId).toHaveBeenCalledWith({ model: model2 });
    expect(overrideModelId).toHaveBeenCalledWith({ model: model3 });
  });

  it('should work when the provider is a ProviderV2', () => {
    const v2Model1 = new MockLanguageModelV2({ modelId: 'model-1' });
    const v2Model2 = new MockLanguageModelV2({ modelId: 'model-2' });

    const providerV2 = new MockProviderV2({
      languageModels: {
        'model-1': v2Model1,
        'model-2': v2Model2,
      },
    });

    const wrapped = wrapProvider({
      provider: providerV2,
      languageModelMiddleware: {
        specificationVersion: 'v3',
        overrideModelId: ({ model }) => `override-${model.modelId}`,
      },
    });

    expect(wrapped.languageModel('model-1').modelId).toBe('override-model-1');
    expect(wrapped.languageModel('model-2').modelId).toBe('override-model-2');
  });

  it('should wrap all image models in the provider when image middleware is provided', () => {
    const model1 = new MockImageModelV3({ modelId: 'model-1' });
    const model2 = new MockImageModelV3({ modelId: 'model-2' });
    const model3 = new MockImageModelV3({ modelId: 'model-3' });

    const provider = new MockProviderV3({
      languageModels: {
        'language-model': new MockLanguageModelV3({
          modelId: 'language-model',
        }),
      },
      imageModels: {
        'model-1': model1,
        'model-2': model2,
        'model-3': model3,
      },
    });

    const overrideModelId = vi
      .fn()
      .mockImplementation(({ model }) => `override-${model.modelId}`);

    const wrappedProvider = wrapProvider({
      provider,
      languageModelMiddleware: { specificationVersion: 'v3' },
      imageModelMiddleware: {
        specificationVersion: 'v3',
        overrideModelId,
      },
    });

    expect(wrappedProvider.imageModel('model-1').modelId).toBe(
      'override-model-1',
    );
    expect(wrappedProvider.imageModel('model-2').modelId).toBe(
      'override-model-2',
    );
    expect(wrappedProvider.imageModel('model-3').modelId).toBe(
      'override-model-3',
    );

    expect(overrideModelId).toHaveBeenCalledTimes(3);
    expect(overrideModelId).toHaveBeenCalledWith({ model: model1 });
    expect(overrideModelId).toHaveBeenCalledWith({ model: model2 });
    expect(overrideModelId).toHaveBeenCalledWith({ model: model3 });
  });
});
