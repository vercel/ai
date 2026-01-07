import { NoSuchModelError } from '@ai-sdk/provider';
import { MockEmbeddingModelV3 } from '../test/mock-embedding-model-v3';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { NoSuchProviderError } from './no-such-provider-error';
import { createProviderRegistry } from './provider-registry';
import { MockImageModelV3 } from '../test/mock-image-model-v3';
import { MockTranscriptionModelV3 } from '../test/mock-transcription-model-v3';
import { MockSpeechModelV3 } from '../test/mock-speech-model-v3';
import { MockRerankingModelV3 } from '../test/mock-reranking-model-v3';
import { MockProviderV3 } from '../test/mock-provider-v3';
import { describe, it, expect, vi } from 'vitest';

describe('languageModel', () => {
  it('should return language model from provider', () => {
    const model = new MockLanguageModelV3();

    const modelRegistry = createProviderRegistry({
      provider: {
        specificationVersion: 'v3',
        languageModel: (id: string) => {
          expect(id).toEqual('model');
          return model;
        },
        embeddingModel: (id: string) => {
          return null as any;
        },
        imageModel: (id: string) => {
          return null as any;
        },
        rerankingModel: (id: string) => {
          return null as any;
        },
      },
    });

    expect(modelRegistry.languageModel('provider:model')).toEqual(model);
  });

  it('should return language model with additional colon from provider', () => {
    const model = new MockLanguageModelV3();

    const modelRegistry = createProviderRegistry({
      provider: {
        specificationVersion: 'v3',
        languageModel: id => {
          expect(id).toEqual('model:part2');
          return model;
        },
        embeddingModel: () => {
          return null as any;
        },
        imageModel: () => {
          return null as any;
        },
        rerankingModel: (id: string) => {
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
        specificationVersion: 'v3',
        languageModel: () => {
          return null as any;
        },
        embeddingModel: () => {
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
        rerankingModel: () => {
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
    const model = new MockLanguageModelV3();

    const modelRegistry = createProviderRegistry(
      {
        provider: {
          specificationVersion: 'v3',
          languageModel: id => {
            expect(id).toEqual('model');
            return model;
          },
          embeddingModel: () => {
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
          rerankingModel: () => {
            return null as any;
          },
        },
      },
      { separator: '|' },
    );

    expect(modelRegistry.languageModel('provider|model')).toEqual(model);
  });

  it('should support custom separator with multiple characters', () => {
    const model = new MockLanguageModelV3();

    const modelRegistry = createProviderRegistry(
      {
        provider: {
          specificationVersion: 'v3',
          languageModel: id => {
            expect(id).toEqual('model');
            return model;
          },
          embeddingModel: () => {
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
          rerankingModel: () => {
            return null as any;
          },
        },
      },
      { separator: ' > ' },
    );

    expect(modelRegistry.languageModel('provider > model')).toEqual(model);
  });
});

describe('embeddingModel', () => {
  it('should return embedding model from provider using embeddingModel', () => {
    const model = new MockEmbeddingModelV3();

    const modelRegistry = createProviderRegistry({
      provider: {
        specificationVersion: 'v3',
        embeddingModel: id => {
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
        rerankingModel: () => {
          return null as any;
        },
      },
    });

    expect(modelRegistry.embeddingModel('provider:model')).toEqual(model);
  });

  it('should throw NoSuchProviderError if provider does not exist', () => {
    const registry = createProviderRegistry({});

    // @ts-expect-error - should not accept arbitrary strings
    expect(() => registry.embeddingModel('provider:model')).toThrowError(
      NoSuchProviderError,
    );
  });

  it('should throw NoSuchModelError if provider does not return a model', () => {
    const registry = createProviderRegistry({
      provider: {
        specificationVersion: 'v3',
        embeddingModel: () => {
          return null as any;
        },
        languageModel: () => {
          return null as any;
        },
        imageModel: () => {
          return null as any;
        },
        rerankingModel: (id: string) => {
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
    expect(() => registry.embeddingModel('model')).toThrowError(
      NoSuchModelError,
    );
  });

  it('should support custom separator', () => {
    const model = new MockEmbeddingModelV3();

    const modelRegistry = createProviderRegistry(
      {
        provider: {
          specificationVersion: 'v3',
          embeddingModel: id => {
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
          rerankingModel: (id: string) => {
            return null as any;
          },
        },
      },
      { separator: '|' },
    );

    expect(modelRegistry.embeddingModel('provider|model')).toEqual(model);
  });
});

describe('imageModel', () => {
  it('should return image model from provider', () => {
    const model = new MockImageModelV3();

    const modelRegistry = createProviderRegistry({
      provider: {
        specificationVersion: 'v3',
        imageModel: id => {
          expect(id).toEqual('model');
          return model;
        },
        languageModel: () => null as any,
        embeddingModel: () => null as any,
        transcriptionModel: () => null as any,
        speechModel: () => null as any,
        rerankingModel: () => null as any,
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
        specificationVersion: 'v3',
        imageModel: () => null as any,
        languageModel: () => null as any,
        embeddingModel: () => null as any,
        transcriptionModel: () => null as any,
        rerankingModel: () => null as any,
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
    const model = new MockImageModelV3();

    const modelRegistry = createProviderRegistry(
      {
        provider: {
          specificationVersion: 'v3',
          imageModel: id => {
            expect(id).toEqual('model');
            return model;
          },
          languageModel: () => null as any,
          embeddingModel: () => null as any,
          rerankingModel: () => null as any,
        },
      },
      { separator: '|' },
    );

    expect(modelRegistry.imageModel('provider|model')).toEqual(model);
  });
});

describe('transcriptionModel', () => {
  it('should return transcription model from provider', () => {
    const model = new MockTranscriptionModelV3();

    const modelRegistry = createProviderRegistry({
      provider: {
        specificationVersion: 'v3',
        transcriptionModel: id => {
          expect(id).toEqual('model');
          return model;
        },
        languageModel: () => null as any,
        embeddingModel: () => null as any,
        imageModel: () => null as any,
        rerankingModel: () => null as any,
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
        specificationVersion: 'v3',
        transcriptionModel: () => null as any,
        languageModel: () => null as any,
        embeddingModel: () => null as any,
        imageModel: () => null as any,
        rerankingModel: () => null as any,
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
    const model = new MockSpeechModelV3();

    const modelRegistry = createProviderRegistry({
      provider: {
        specificationVersion: 'v3',
        speechModel: id => {
          expect(id).toEqual('model');
          return model;
        },
        languageModel: () => null as any,
        embeddingModel: () => null as any,
        imageModel: () => null as any,
        rerankingModel: () => null as any,
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
        specificationVersion: 'v3',
        speechModel: () => null as any,
        languageModel: () => null as any,
        embeddingModel: () => null as any,
        imageModel: () => null as any,
        rerankingModel: () => null as any,
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

describe('rerankingModel', () => {
  it('should return reranking model from provider using rerankingModel', () => {
    const model = new MockRerankingModelV3();

    const modelRegistry = createProviderRegistry({
      provider: {
        specificationVersion: 'v3',
        rerankingModel: id => {
          expect(id).toEqual('model');
          return model;
        },
        embeddingModel: () => {
          return null as any;
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

    expect(modelRegistry.rerankingModel('provider:model')).toEqual(model);
  });

  it('should throw NoSuchProviderError if provider does not exist', () => {
    const registry = createProviderRegistry({});

    // @ts-expect-error - should not accept arbitrary strings
    expect(() => registry.rerankingModel('provider:model')).toThrowError(
      NoSuchProviderError,
    );
  });

  it('should throw NoSuchModelError if provider does not return a model', () => {
    const registry = createProviderRegistry({
      provider: {
        specificationVersion: 'v3',
        embeddingModel: () => {
          return null as any;
        },
        languageModel: () => {
          return null as any;
        },
        imageModel: () => {
          return null as any;
        },
        rerankingModel: (id: string) => {
          return null as any;
        },
      },
    });

    expect(() => registry.rerankingModel('provider:model')).toThrowError(
      NoSuchModelError,
    );
  });

  it("should throw NoSuchModelError if model id doesn't contain a colon", () => {
    const registry = createProviderRegistry({});

    // @ts-expect-error - should not accept arbitrary strings
    expect(() => registry.rerankingModel('model')).toThrowError(
      NoSuchModelError,
    );
  });

  it('should support custom separator', () => {
    const model = new MockRerankingModelV3();

    const modelRegistry = createProviderRegistry(
      {
        provider: {
          specificationVersion: 'v3',
          rerankingModel: id => {
            expect(id).toEqual('model');
            return model;
          },
          embeddingModel: () => {
            return null as any;
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

    expect(modelRegistry.rerankingModel('provider|model')).toEqual(model);
  });
});

describe('middleware functionality', () => {
  it('should wrap all language models accessed through the provider registry', () => {
    const model1 = new MockLanguageModelV3({ modelId: 'model-1' });
    const model2 = new MockLanguageModelV3({ modelId: 'model-2' });
    const model3 = new MockLanguageModelV3({ modelId: 'model-3' });

    const provider1 = new MockProviderV3({
      languageModels: {
        'model-1': model1,
        'model-2': model2,
      },
    });

    const provider2 = new MockProviderV3({
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
          specificationVersion: 'v3',
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

  it('should wrap all image models accessed through the provider registry', () => {
    const model1 = new MockImageModelV3({ modelId: 'model-1' });
    const model2 = new MockImageModelV3({ modelId: 'model-2' });
    const model3 = new MockImageModelV3({ modelId: 'model-3' });

    const provider1 = new MockProviderV3({
      imageModels: {
        'model-1': model1,
        'model-2': model2,
      },
    });

    const provider2 = new MockProviderV3({
      imageModels: {
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
        imageModelMiddleware: {
          specificationVersion: 'v3',
          overrideModelId,
        },
      },
    );

    expect(registry.imageModel('provider1:model-1').modelId).toBe(
      'override-model-1',
    );
    expect(registry.imageModel('provider1:model-2').modelId).toBe(
      'override-model-2',
    );
    expect(registry.imageModel('provider2:model-3').modelId).toBe(
      'override-model-3',
    );

    expect(overrideModelId).toHaveBeenCalledTimes(3);
    expect(overrideModelId).toHaveBeenCalledWith({ model: model1 });
    expect(overrideModelId).toHaveBeenCalledWith({ model: model2 });
    expect(overrideModelId).toHaveBeenCalledWith({ model: model3 });
  });
});
