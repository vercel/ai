import { NoSuchModelError } from '@ai-sdk/provider';
import { MockEmbeddingModelV2 } from '../test/mock-embedding-model-v2';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { NoSuchProviderError } from './no-such-provider-error';
import { createProviderRegistry } from './provider-registry';
import { MockImageModelV2 } from '../test/mock-image-model-v2';
import { MockTranscriptionModelV2 } from '../test/mock-transcription-model-v2';
import { MockSpeechModelV2 } from '../test/mock-speech-model-v2';
import { MockProviderV2 } from '../test/mock-provider-v2';

describe('languageModel', () => {
  it('should return language model from provider', () => {
    const model = new MockLanguageModelV2();

    const modelRegistry = createProviderRegistry({
      provider: {
        languageModel: (id: string) => {
          expect(id).toEqual('model');
          return model;
        },
        textEmbeddingModel: (id: string) => {
          return null as any;
        },
        imageModel: (id: string) => {
          return null as any;
        },
      },
    });

    expect(modelRegistry.languageModel('provider:model')).toEqual(model);
  });

  it('should return language model with additional colon from provider', () => {
    const model = new MockLanguageModelV2();

    const modelRegistry = createProviderRegistry({
      provider: {
        languageModel: id => {
          expect(id).toEqual('model:part2');
          return model;
        },
        textEmbeddingModel: () => {
          return null as any;
        },
        imageModel: () => {
          return null as any;
        },
      },
    });

    expect(modelRegistry.languageModel('provider:model:part2')).toEqual(model);
  });

  it('should throw NoSuchProviderError if provider does not exist', () => {
    const registry = createProviderRegistry({});

    // @ts-expect-error - should not accept arbitrary strings
    expect(() => registry.languageModel('provider:model:part2')).toThrowError(
      NoSuchProviderError,
    );
  });

  it('should throw NoSuchModelError if provider does not return a model', () => {
    const registry = createProviderRegistry({
      provider: {
        languageModel: () => {
          return null as any;
        },
        textEmbeddingModel: () => {
          return null as any;
        },
        imageModel: () => {
          return null as any;
        },
        transcriptionModel: () => {
          return null as any;
        },
        speechModel: () => {
          return null as any;
        },
      },
    });

    expect(() => registry.languageModel('provider:model')).toThrowError(
      NoSuchModelError,
    );
  });

  it("should throw NoSuchModelError if model id doesn't contain a colon", () => {
    const registry = createProviderRegistry({});

    // @ts-expect-error - should not accept arbitrary strings
    expect(() => registry.languageModel('model')).toThrowError(
      NoSuchModelError,
    );
  });

  it('should support custom separator', () => {
    const model = new MockLanguageModelV2();

    const modelRegistry = createProviderRegistry(
      {
        provider: {
          languageModel: id => {
            expect(id).toEqual('model');
            return model;
          },
          textEmbeddingModel: () => {
            return null as any;
          },
          imageModel: () => {
            return null as any;
          },
          transcriptionModel: () => {
            return null as any;
          },
          speechModel: () => {
            return null as any;
          },
        },
      },
      { separator: '|' },
    );

    expect(modelRegistry.languageModel('provider|model')).toEqual(model);
  });

  it('should support custom separator with multiple characters', () => {
    const model = new MockLanguageModelV2();

    const modelRegistry = createProviderRegistry(
      {
        provider: {
          languageModel: id => {
            expect(id).toEqual('model');
            return model;
          },
          textEmbeddingModel: () => {
            return null as any;
          },
          imageModel: () => {
            return null as any;
          },
          transcriptionModel: () => {
            return null as any;
          },
          speechModel: () => {
            return null as any;
          },
        },
      },
      { separator: ' > ' },
    );

    expect(modelRegistry.languageModel('provider > model')).toEqual(model);
  });
});

describe('textEmbeddingModel', () => {
  it('should return embedding model from provider using textEmbeddingModel', () => {
    const model = new MockEmbeddingModelV2<string>();

    const modelRegistry = createProviderRegistry({
      provider: {
        textEmbeddingModel: id => {
          expect(id).toEqual('model');
          return model;
        },
        languageModel: () => {
          return null as any;
        },
        imageModel: () => {
          return null as any;
        },
        transcriptionModel: () => {
          return null as any;
        },
        speechModel: () => {
          return null as any;
        },
      },
    });

    expect(modelRegistry.textEmbeddingModel('provider:model')).toEqual(model);
  });

  it('should throw NoSuchProviderError if provider does not exist', () => {
    const registry = createProviderRegistry({});

    // @ts-expect-error - should not accept arbitrary strings
    expect(() => registry.textEmbeddingModel('provider:model')).toThrowError(
      NoSuchProviderError,
    );
  });

  it('should throw NoSuchModelError if provider does not return a model', () => {
    const registry = createProviderRegistry({
      provider: {
        textEmbeddingModel: () => {
          return null as any;
        },
        languageModel: () => {
          return null as any;
        },
        imageModel: () => {
          return null as any;
        },
      },
    });

    expect(() => registry.languageModel('provider:model')).toThrowError(
      NoSuchModelError,
    );
  });

  it("should throw NoSuchModelError if model id doesn't contain a colon", () => {
    const registry = createProviderRegistry({});

    // @ts-expect-error - should not accept arbitrary strings
    expect(() => registry.textEmbeddingModel('model')).toThrowError(
      NoSuchModelError,
    );
  });

  it('should support custom separator', () => {
    const model = new MockEmbeddingModelV2<string>();

    const modelRegistry = createProviderRegistry(
      {
        provider: {
          textEmbeddingModel: id => {
            expect(id).toEqual('model');
            return model;
          },
          languageModel: () => {
            return null as any;
          },
          imageModel: () => {
            return null as any;
          },
          transcriptionModel: () => {
            return null as any;
          },
          speechModel: () => {
            return null as any;
          },
        },
      },
      { separator: '|' },
    );

    expect(modelRegistry.textEmbeddingModel('provider|model')).toEqual(model);
  });
});

describe('imageModel', () => {
  it('should return image model from provider', () => {
    const model = new MockImageModelV2();

    const modelRegistry = createProviderRegistry({
      provider: {
        imageModel: id => {
          expect(id).toEqual('model');
          return model;
        },
        languageModel: () => null as any,
        textEmbeddingModel: () => null as any,
        transcriptionModel: () => null as any,
        speechModel: () => null as any,
      },
    });

    expect(modelRegistry.imageModel('provider:model')).toEqual(model);
  });

  it('should throw NoSuchProviderError if provider does not exist', () => {
    const registry = createProviderRegistry({});

    // @ts-expect-error - should not accept arbitrary strings
    expect(() => registry.imageModel('provider:model')).toThrowError(
      NoSuchProviderError,
    );
  });

  it('should throw NoSuchModelError if provider does not return a model', () => {
    const registry = createProviderRegistry({
      provider: {
        imageModel: () => null as any,
        languageModel: () => null as any,
        textEmbeddingModel: () => null as any,
      },
    });

    expect(() => registry.imageModel('provider:model')).toThrowError(
      NoSuchModelError,
    );
  });

  it("should throw NoSuchModelError if model id doesn't contain a colon", () => {
    const registry = createProviderRegistry({});

    // @ts-expect-error - should not accept arbitrary strings
    expect(() => registry.imageModel('model')).toThrowError(NoSuchModelError);
  });

  it('should support custom separator', () => {
    const model = new MockImageModelV2();

    const modelRegistry = createProviderRegistry(
      {
        provider: {
          imageModel: id => {
            expect(id).toEqual('model');
            return model;
          },
          languageModel: () => null as any,
          textEmbeddingModel: () => null as any,
        },
      },
      { separator: '|' },
    );

    expect(modelRegistry.imageModel('provider|model')).toEqual(model);
  });
});

describe('transcriptionModel', () => {
  it('should return transcription model from provider', () => {
    const model = new MockTranscriptionModelV2();

    const modelRegistry = createProviderRegistry({
      provider: {
        transcriptionModel: id => {
          expect(id).toEqual('model');
          return model;
        },
        languageModel: () => null as any,
        textEmbeddingModel: () => null as any,
        imageModel: () => null as any,
      },
    });

    expect(modelRegistry.transcriptionModel('provider:model')).toEqual(model);
  });

  it('should throw NoSuchProviderError if provider does not exist', () => {
    const registry = createProviderRegistry({});

    // @ts-expect-error - should not accept arbitrary strings
    expect(() => registry.transcriptionModel('provider:model')).toThrowError(
      NoSuchProviderError,
    );
  });

  it('should throw NoSuchModelError if provider does not return a model', () => {
    const registry = createProviderRegistry({
      provider: {
        transcriptionModel: () => null as any,
        languageModel: () => null as any,
        textEmbeddingModel: () => null as any,
        imageModel: () => null as any,
      },
    });

    expect(() => registry.transcriptionModel('provider:model')).toThrowError(
      NoSuchModelError,
    );
  });

  it("should throw NoSuchModelError if model id doesn't contain a colon", () => {
    const registry = createProviderRegistry({});

    // @ts-expect-error - should not accept arbitrary strings
    expect(() => registry.transcriptionModel('model')).toThrowError(
      NoSuchModelError,
    );
  });
});

describe('speechModel', () => {
  it('should return speech model from provider', () => {
    const model = new MockSpeechModelV2();

    const modelRegistry = createProviderRegistry({
      provider: {
        speechModel: id => {
          expect(id).toEqual('model');
          return model;
        },
        languageModel: () => null as any,
        textEmbeddingModel: () => null as any,
        imageModel: () => null as any,
      },
    });

    expect(modelRegistry.speechModel('provider:model')).toEqual(model);
  });

  it('should throw NoSuchProviderError if provider does not exist', () => {
    const registry = createProviderRegistry({});

    // @ts-expect-error - should not accept arbitrary strings
    expect(() => registry.speechModel('provider:model')).toThrowError(
      NoSuchProviderError,
    );
  });

  it('should throw NoSuchModelError if provider does not return a model', () => {
    const registry = createProviderRegistry({
      provider: {
        speechModel: () => null as any,
        languageModel: () => null as any,
        textEmbeddingModel: () => null as any,
        imageModel: () => null as any,
      },
    });

    expect(() => registry.speechModel('provider:model')).toThrowError(
      NoSuchModelError,
    );
  });

  it("should throw NoSuchModelError if model id doesn't contain a colon", () => {
    const registry = createProviderRegistry({});

    // @ts-expect-error - should not accept arbitrary strings
    expect(() => registry.speechModel('model')).toThrowError(NoSuchModelError);
  });
});

describe('middleware functionality', () => {
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

    const overrideModelId = vi
      .fn()
      .mockImplementation(({ model }) => `override-${model.modelId}`);

    const registry = createProviderRegistry(
      {
        provider1,
        provider2,
      },
      {
        languageModelMiddleware: {
          middlewareVersion: 'v2',
          overrideModelId,
        },
      },
    );

    expect(registry.languageModel('provider1:model-1').modelId).toBe(
      'override-model-1',
    );
    expect(registry.languageModel('provider1:model-2').modelId).toBe(
      'override-model-2',
    );
    expect(registry.languageModel('provider2:model-3').modelId).toBe(
      'override-model-3',
    );

    expect(overrideModelId).toHaveBeenCalledTimes(3);
    expect(overrideModelId).toHaveBeenCalledWith({ model: model1 });
    expect(overrideModelId).toHaveBeenCalledWith({ model: model2 });
    expect(overrideModelId).toHaveBeenCalledWith({ model: model3 });
  });
});
