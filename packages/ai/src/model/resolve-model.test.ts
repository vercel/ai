import { customProvider } from '../registry/custom-provider';
import { MockEmbeddingModelV2 } from '../test/mock-embedding-model-v2';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { resolveEmbeddingModel, resolveLanguageModel } from './resolve-model';

describe('resolveLanguageModel', () => {
  describe('when a language model v2 is provided', () => {
    it('should return the language model v2', () => {
      const resolvedModel = resolveLanguageModel(
        new MockLanguageModelV2({
          provider: 'test-provider',
          modelId: 'test-model-id',
        }),
      );

      expect(resolvedModel.provider).toBe('test-provider');
      expect(resolvedModel.modelId).toBe('test-model-id');
    });
  });

  describe('when a string is provided and the global default provider is not set', () => {
    it('should return a gateway language model', () => {
      const resolvedModel = resolveLanguageModel('test-model-id');

      expect(resolvedModel.provider).toBe('gateway');
      expect(resolvedModel.modelId).toBe('test-model-id');
    });
  });

  describe('when a string is provided and the global default provider is set', () => {
    beforeEach(() => {
      globalThis.AI_SDK_DEFAULT_PROVIDER = customProvider({
        languageModels: {
          'test-model-id': new MockLanguageModelV2({
            provider: 'global-test-provider',
            modelId: 'actual-test-model-id',
          }),
        },
      });
    });

    afterEach(() => {
      delete globalThis.AI_SDK_DEFAULT_PROVIDER;
    });

    it('should return a language model from the global default provider', () => {
      const resolvedModel = resolveLanguageModel('test-model-id');

      expect(resolvedModel.provider).toBe('global-test-provider');
      expect(resolvedModel.modelId).toBe('actual-test-model-id');
    });
  });
});

describe('resolveEmbeddingModel', () => {
  describe('when a embedding model v2 is provided', () => {
    it('should return the embedding model v2', () => {
      const resolvedModel = resolveEmbeddingModel(
        new MockEmbeddingModelV2({
          provider: 'test-provider',
          modelId: 'test-model-id',
        }),
      );

      expect(resolvedModel.provider).toBe('test-provider');
      expect(resolvedModel.modelId).toBe('test-model-id');
    });
  });

  describe('when a string is provided and the global default provider is not set', () => {
    it('should return a gateway embedding model', () => {
      const resolvedModel = resolveEmbeddingModel('test-model-id');

      expect(resolvedModel.provider).toBe('gateway');
      expect(resolvedModel.modelId).toBe('test-model-id');
    });
  });

  describe('when a string is provided and the global default provider is set', () => {
    beforeEach(() => {
      globalThis.AI_SDK_DEFAULT_PROVIDER = customProvider({
        textEmbeddingModels: {
          'test-model-id': new MockEmbeddingModelV2({
            provider: 'global-test-provider',
            modelId: 'actual-test-model-id',
          }),
        },
      });
    });

    afterEach(() => {
      delete globalThis.AI_SDK_DEFAULT_PROVIDER;
    });

    it('should return a embedding model from the global default provider', () => {
      const resolvedModel = resolveEmbeddingModel('test-model-id');

      expect(resolvedModel.provider).toBe('global-test-provider');
      expect(resolvedModel.modelId).toBe('actual-test-model-id');
    });
  });
});
