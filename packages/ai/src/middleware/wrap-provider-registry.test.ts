import { createProviderRegistry } from '../registry/provider-registry';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { MockProviderV2 } from '../test/mock-provider-v2';
import { wrapProviderRegistry } from './wrap-provider-registry';

describe('wrapProviderRegistry', () => {
  it('should wrap all language models accessed through the provider registry', () => {
    const model1 = new MockLanguageModelV2({ modelId: 'model-1' });
    const model2 = new MockLanguageModelV2({ modelId: 'model-2' });
    const model3 = new MockLanguageModelV2({ modelId: 'model-3' });

    const provider1 = new MockProviderV2({
      languageModels: {
        'model-1': model1,
        'model-2': model2,
      },
    });

    const provider2 = new MockProviderV2({
      languageModels: {
        'model-3': model3,
      },
    });

    const registry = createProviderRegistry({
      provider1,
      provider2,
    });

    const overrideModelId = vi
      .fn()
      .mockImplementation(({ model }) => `override-${model.modelId}`);

    const wrappedRegistry = wrapProviderRegistry({
      registry,
      middleware: {
        middlewareVersion: 'v2',
        overrideModelId,
      },
    });

    expect(wrappedRegistry.languageModel('provider1:model-1').modelId).toBe(
      'override-model-1',
    );
    expect(wrappedRegistry.languageModel('provider1:model-2').modelId).toBe(
      'override-model-2',
    );
    expect(wrappedRegistry.languageModel('provider2:model-3').modelId).toBe(
      'override-model-3',
    );

    expect(overrideModelId).toHaveBeenCalledTimes(3);
    expect(overrideModelId).toHaveBeenCalledWith({ model: model1 });
    expect(overrideModelId).toHaveBeenCalledWith({ model: model2 });
    expect(overrideModelId).toHaveBeenCalledWith({ model: model3 });
  });
});
