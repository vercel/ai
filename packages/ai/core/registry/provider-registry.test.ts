import { NoSuchModelError } from '@ai-sdk/provider';
import { MockEmbeddingModelV2 } from '../test/mock-embedding-model-v2';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { NoSuchProviderError } from './no-such-provider-error';
import { createProviderRegistry } from './provider-registry';
import { MockImageModelV2 } from '../test/mock-image-model-v2';

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
