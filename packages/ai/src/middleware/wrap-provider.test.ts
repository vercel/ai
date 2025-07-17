import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { MockProviderV2 } from '../test/mock-provider-v2';
import { wrapProvider } from './wrap-provider';

describe('wrapProvider', () => {
  it('should wrap all language models in the provider', () => {
    const model1 = new MockLanguageModelV2({ modelId: 'model-1' });
    const model2 = new MockLanguageModelV2({ modelId: 'model-2' });
    const model3 = new MockLanguageModelV2({ modelId: 'model-3' });

    const provider = new MockProviderV2({
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
        middlewareVersion: 'v2',
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
});
