import { NoSuchModelError } from '@ai-sdk/provider';
import { MockEmbeddingModelV1 } from '../test/mock-embedding-model-v1';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { NoSuchProviderError } from './no-such-provider-error';
import { experimental_createProviderRegistry } from './provider-registry';

describe('languageModel', () => {
  it('should return language model from provider', () => {
    const model = new MockLanguageModelV1();

    const modelRegistry = experimental_createProviderRegistry({
      provider: {
        languageModel: id => {
          expect(id).toEqual('model');
          return model;
        },
        textEmbeddingModel: () => {
          return null as any;
        },
      },
    });

    expect(modelRegistry.languageModel('provider:model')).toEqual(model);
  });

  it('should return language model with additional colon from provider', () => {
    const model = new MockLanguageModelV1();

    const modelRegistry = experimental_createProviderRegistry({
      provider: {
        languageModel: id => {
          expect(id).toEqual('model:part2');
          return model;
        },
        textEmbeddingModel: () => {
          return null as any;
        },
      },
    });

    expect(modelRegistry.languageModel('provider:model:part2')).toEqual(model);
  });

  it('should throw NoSuchProviderError if provider does not exist', () => {
    const registry = experimental_createProviderRegistry({});

    expect(() => registry.languageModel('provider:model:part2')).toThrowError(
      NoSuchProviderError,
    );
  });

  it('should throw NoSuchModelError if provider does not return a model', () => {
    const registry = experimental_createProviderRegistry({
      provider: {
        languageModel: () => {
          return null as any;
        },
        textEmbeddingModel: () => {
          return null as any;
        },
      },
    });

    expect(() => registry.languageModel('provider:model')).toThrowError(
      NoSuchModelError,
    );
  });

  it("should throw NoSuchModelError if model id doesn't contain a colon", () => {
    const registry = experimental_createProviderRegistry({});

    expect(() => registry.languageModel('model')).toThrowError(
      NoSuchModelError,
    );
  });
});

describe('textEmbeddingModel', () => {
  it('should return embedding model from provider using textEmbeddingModel', () => {
    const model = new MockEmbeddingModelV1<string>();

    const modelRegistry = experimental_createProviderRegistry({
      provider: {
        textEmbeddingModel: id => {
          expect(id).toEqual('model');
          return model;
        },
        languageModel: () => {
          return null as any;
        },
      },
    });

    expect(modelRegistry.textEmbeddingModel('provider:model')).toEqual(model);
  });

  it('should throw NoSuchProviderError if provider does not exist', () => {
    const registry = experimental_createProviderRegistry({});

    expect(() => registry.textEmbeddingModel('provider:model')).toThrowError(
      NoSuchProviderError,
    );
  });

  it('should throw NoSuchModelError if provider does not return a model', () => {
    const registry = experimental_createProviderRegistry({
      provider: {
        textEmbeddingModel: () => {
          return null as any;
        },
        languageModel: () => {
          return null as any;
        },
      },
    });

    expect(() => registry.languageModel('provider:model')).toThrowError(
      NoSuchModelError,
    );
  });

  it("should throw NoSuchModelError if model id doesn't contain a colon", () => {
    const registry = experimental_createProviderRegistry({});

    expect(() => registry.textEmbeddingModel('model')).toThrowError(
      NoSuchModelError,
    );
  });
});
