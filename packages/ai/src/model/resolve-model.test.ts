import { customProvider } from '../registry/custom-provider';
import { MockEmbeddingModelV2 } from '../test/mock-embedding-model-v2';
import { MockEmbeddingModelV3 } from '../test/mock-embedding-model-v3';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { resolveEmbeddingModel, resolveLanguageModel } from './resolve-model';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';

describe('resolveLanguageModel', () => {
  describe('when a language model v3 is provided', () => {
    it('should return the language model v3', () => {
      const resolvedModel = resolveLanguageModel(
        new MockLanguageModelV3({
          provider: 'test-provider',
          modelId: 'test-model-id',
        }),
      );

      expect(resolvedModel.provider).toBe('test-provider');
      expect(resolvedModel.modelId).toBe('test-model-id');
      expect(resolvedModel.specificationVersion).toBe('v3');
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
          'test-model-id': new MockLanguageModelV3({
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
  describe('when a embedding model v3 is provided', () => {
    it('should return the embedding model v3', () => {
      const resolvedModel = resolveEmbeddingModel(
        new MockEmbeddingModelV3({
          provider: 'test-provider',
          modelId: 'test-model-id',
        }),
      );

      expect(resolvedModel.provider).toBe('test-provider');
      expect(resolvedModel.modelId).toBe('test-model-id');
      expect(resolvedModel.specificationVersion).toBe('v3');
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
          'test-model-id': new MockEmbeddingModelV3({
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
