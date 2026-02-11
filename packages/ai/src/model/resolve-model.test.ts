import { gateway } from '@ai-sdk/gateway';
import { EmbeddingModelV2, LanguageModelV2 } from '@ai-sdk/provider';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { MockEmbeddingModelV3 } from '../test/mock-embedding-model-v3';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { MockVideoModelV3 } from '../test/mock-video-model-v3';
import { customProvider } from '../registry/custom-provider';
import { MockImageModelV2 } from '../test/mock-image-model-v2';
import {
  resolveEmbeddingModel,
  resolveImageModel,
  resolveLanguageModel,
  resolveVideoModel,
} from './resolve-model';

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
    it('should adapt to v3 and preserve prototype methods', async () => {
      class TestLanguageModelV2 implements LanguageModelV2 {
        readonly specificationVersion = 'v2' as const;
        readonly provider = 'test-provider';
        readonly modelId = 'test-model-id';
        readonly supportedUrls = {};

        async doGenerate() {
          return {
            content: [],
            finishReason: 'stop' as const,
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            warnings: [],
          };
        }

        async doStream() {
          return { stream: new ReadableStream() };
        }
      }

      const v2 = new TestLanguageModelV2();
      const resolvedModel = resolveLanguageModel(v2);

      expect(resolvedModel.provider).toBe('test-provider');
      expect(resolvedModel.modelId).toBe('test-model-id');
      expect(resolvedModel.specificationVersion).toBe('v3');

      await resolvedModel.doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      });

      const { stream } = await resolvedModel.doStream({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      });
      expect(stream).toBeInstanceOf(ReadableStream);
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
    it('should adapt to v3 and preserve prototype methods', async () => {
      class TestEmbeddingModelV2 implements EmbeddingModelV2<string> {
        readonly specificationVersion = 'v2' as const;
        readonly provider = 'test-provider';
        readonly modelId = 'test-model-id';
        readonly maxEmbeddingsPerCall = 1;
        readonly supportsParallelCalls = false;

        async doEmbed() {
          return { embeddings: [[0.1, 0.2, 0.3]] };
        }
      }

      const v2 = new TestEmbeddingModelV2();
      const resolvedModel = resolveEmbeddingModel(v2);

      expect(resolvedModel.provider).toBe('test-provider');
      expect(resolvedModel.modelId).toBe('test-model-id');
      expect(resolvedModel.specificationVersion).toBe('v3');

      const result = await resolvedModel.doEmbed({ values: ['hello'] });
      expect(result.embeddings).toHaveLength(1);
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
        embeddingModels: {
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

describe('resolveImageModel', () => {
  describe('when an image model v2 is provided', () => {
    it('should return the image model v2', () => {
      const resolvedModel = resolveImageModel(
        new MockImageModelV2({
          provider: 'test-provider',
          modelId: 'test-model-id',
        }),
      );

      expect(resolvedModel.provider).toBe('test-provider');
      expect(resolvedModel.modelId).toBe('test-model-id');
    });
  });

  describe('when a string is provided and the global default provider is not set', () => {
    it('should return a gateway image model', () => {
      const resolvedModel = resolveImageModel(
        new MockImageModelV2({
          provider: 'gateway',
          modelId: 'test-model-id',
        }),
      );

      const imageModelSpy = vi
        .spyOn(gateway, 'imageModel')
        .mockReturnValue(resolvedModel);

      try {
        const resolvedModel = resolveImageModel('test-model-id');

        expect(resolvedModel).toBe(resolvedModel);
      } finally {
        imageModelSpy.mockRestore();
      }
    });
  });

  describe('when a string is provided and the global default provider is set', () => {
    beforeEach(() => {
      globalThis.AI_SDK_DEFAULT_PROVIDER = customProvider({
        imageModels: {
          'test-model-id': resolveImageModel(
            new MockImageModelV2({
              provider: 'global-test-provider',
              modelId: 'actual-test-model-id',
            }),
          ),
        },
      });
    });

    afterEach(() => {
      delete globalThis.AI_SDK_DEFAULT_PROVIDER;
    });

    it('should return an image model from the global default provider', () => {
      const resolvedModel = resolveImageModel('test-model-id');

      expect(resolvedModel.provider).toBe('global-test-provider');
      expect(resolvedModel.modelId).toBe('actual-test-model-id');
    });
  });
});

describe('resolveVideoModel', () => {
  describe('when a video model v3 is provided', () => {
    it('should return the video model v3', () => {
      const resolvedModel = resolveVideoModel(
        new MockVideoModelV3({
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
    it('should return a gateway video model', () => {
      const mockModel = new MockVideoModelV3({
        provider: 'gateway',
        modelId: 'test-model-id',
      });

      const videoModelSpy = vi
        .spyOn(gateway, 'videoModel')
        .mockReturnValue(mockModel);

      try {
        const resolvedModel = resolveVideoModel('test-model-id');

        expect(resolvedModel.provider).toBe('gateway');
        expect(resolvedModel.modelId).toBe('test-model-id');
      } finally {
        videoModelSpy.mockRestore();
      }
    });
  });

  describe('when a string is provided and the global default provider is set', () => {
    beforeEach(() => {
      globalThis.AI_SDK_DEFAULT_PROVIDER = customProvider({
        videoModels: {
          'test-model-id': new MockVideoModelV3({
            provider: 'global-test-provider',
            modelId: 'actual-test-model-id',
          }),
        },
      });
    });

    afterEach(() => {
      delete globalThis.AI_SDK_DEFAULT_PROVIDER;
    });

    it('should return a video model from the global default provider', () => {
      const resolvedModel = resolveVideoModel('test-model-id');

      expect(resolvedModel.provider).toBe('global-test-provider');
      expect(resolvedModel.modelId).toBe('actual-test-model-id');
    });
  });

  describe('when a string is provided and the provider does not support video models', () => {
    beforeEach(() => {
      globalThis.AI_SDK_DEFAULT_PROVIDER = {
        specificationVersion: 'v3' as const,
        languageModel: () => {
          throw new Error('not implemented');
        },
        embeddingModel: () => {
          throw new Error('not implemented');
        },
        imageModel: () => {
          throw new Error('not implemented');
        },
      };
    });

    afterEach(() => {
      delete globalThis.AI_SDK_DEFAULT_PROVIDER;
    });

    it('should throw an error', () => {
      expect(() => resolveVideoModel('test-model-id')).toThrow(
        'The default provider does not support video models.',
      );
    });
  });

  describe('when a model with unsupported specification version is provided', () => {
    it('should throw UnsupportedModelVersionError', () => {
      const unsupportedModel = {
        specificationVersion: 'v1',
        provider: 'test-provider',
        modelId: 'test-model-id',
      } as any;

      expect(() => resolveVideoModel(unsupportedModel)).toThrow();
    });

    it('should throw UnsupportedModelVersionError for v2 models', () => {
      const v2Model = {
        specificationVersion: 'v2',
        provider: 'test-provider',
        modelId: 'test-model-id',
      } as any;

      expect(() => resolveVideoModel(v2Model)).toThrow();
    });
  });
});
