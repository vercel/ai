import { customProvider } from '../registry/custom-provider';
import { MockEmbeddingModelV2 } from '../test/mock-embedding-model-v2';
import { MockEmbeddingModelV3 } from '../test/mock-embedding-model-v3';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
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

  describe('when a language model v2 is provided', () => {
    it('should adapt to v3 and bind methods', async () => {
      const v2 = new MockLanguageModelV2({
        provider: 'test-provider',
        modelId: 'test-model-id',
        doGenerate: async () => ({
          content: [],
          finishReason: 'stop',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          warnings: [],
        }),
      });

      const resolvedModel = resolveLanguageModel(v2);

      expect(resolvedModel.provider).toBe('test-provider');
      expect(resolvedModel.modelId).toBe('test-model-id');
      expect(resolvedModel.specificationVersion).toBe('v3');

      await resolvedModel.doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      } as any);

      expect(v2.doGenerateCalls.length).toBe(1);
    });

    it('should bind methods for a plain v2-shaped object', async () => {
      let receivedThis: unknown;
      const v2: any = {
        specificationVersion: 'v2',
        provider: 'test-provider',
        modelId: 'test-model-id',
        supportedUrls: {},
        doGenerate: function () {
          receivedThis = this;
          return Promise.resolve({
            content: [],
            finishReason: 'stop',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            warnings: [],
          });
        },
        doStream: function () {
          return Promise.resolve({ stream: new ReadableStream() });
        },
      };

      const resolvedModel = resolveLanguageModel(v2);

      await resolvedModel.doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      } as any);

      expect(receivedThis).toBe(v2);
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
  describe('when an embedding model v2 is provided', () => {
    it('should adapt to v3 and bind methods', async () => {
      let receivedThis: unknown;
      const v2 = new MockEmbeddingModelV2<string>({
        provider: 'test-provider',
        modelId: 'test-model-id',
        doEmbed: function (this: unknown) {
          receivedThis = this;
          return Promise.resolve({ embeddings: [] });
        },
      });

      const resolvedModel = resolveEmbeddingModel(v2);

      expect(resolvedModel.provider).toBe('test-provider');
      expect(resolvedModel.modelId).toBe('test-model-id');
      expect(resolvedModel.specificationVersion).toBe('v3');

      await resolvedModel.doEmbed({ values: ['hello'] });
      expect(receivedThis).toBe(v2);
    });
  });
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
