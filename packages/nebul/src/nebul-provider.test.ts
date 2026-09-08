import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createNebul } from './nebul-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
  OpenAICompatibleImageModel,
} from '@ai-sdk/openai-compatible';
import { NebulTranscriptionModel } from './nebul-transcription-model';
import { NebulSpeechModel } from './nebul-speech-model';
import { NebulRerankingModel } from './nebul-reranking-model';

// Mock the OpenAI-compatible classes
const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;
const OpenAICompatibleEmbeddingModelMock =
  OpenAICompatibleEmbeddingModel as unknown as Mock;
const OpenAICompatibleImageModelMock =
  OpenAICompatibleImageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => {
  const createMockConstructor = (providerName: string) => {
    const mockConstructor = vi.fn().mockImplementation(function (
      this: any,
      modelId: string,
      settings: any,
    ) {
      this.provider = providerName;
      this.modelId = modelId;
      this.settings = settings;
      this.doGenerate = vi.fn();
      this.doEmbed = vi.fn();
    });
    return mockConstructor;
  };

  return {
    OpenAICompatibleChatLanguageModel: createMockConstructor('nebul.chat'),
    OpenAICompatibleEmbeddingModel: createMockConstructor('nebul.embedding'),
    OpenAICompatibleImageModel: createMockConstructor('nebul.image'),
  };
});

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
    withoutTrailingSlash: vi.fn(url => url),
  };
});

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

describe('NebulProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createNebul', () => {
    it('should create a NebulProvider instance with default options', () => {
      const provider = createNebul();
      const model = provider.chat('zai-org/GLM-5.3-Flash');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'NEBUL_API_KEY',
        description: 'Nebul API key',
      });
      expect(headers.authorization).toBe('Bearer mock-api-key');
      expect(config.provider).toBe('nebul.chat');
    });

    it('should create a NebulProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createNebul(options);
      const model = provider.chat('zai-org/GLM-5.3-Flash');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'NEBUL_API_KEY',
        description: 'Nebul API key',
      });
      expect(headers['custom-header']).toBe('value');
    });

    it('should support optional modelId parameter', () => {
      const provider = createNebul();

      // Should work without modelId
      const model1 = provider();
      expect(model1).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'zai-org/GLM-5.3-Flash',
        expect.anything(),
      );

      // Should work with modelId
      const model2 = provider('zai-org/GLM-5.2-FP8');
      expect(model2).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'zai-org/GLM-5.2-FP8',
        expect.anything(),
      );
    });

    it('should set specificationVersion to v4', () => {
      expect(createNebul().specificationVersion).toBe('v4');
    });
  });

  describe('chat model', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createNebul();
      const modelId = 'zai-org/GLM-5.3-Flash';

      const model = provider.chat(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'nebul.chat',
        }),
      );
    });

    it('should build urls against the Nebul Inference API', () => {
      createNebul().chat('zai-org/GLM-5.3-Flash');

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
      expect(
        config.url({
          modelId: 'zai-org/GLM-5.3-Flash',
          path: '/chat/completions',
        }),
      ).toBe('https://api.inference.nebul.io/v1/chat/completions');
    });

    it('should build urls against a custom base URL', () => {
      createNebul({ baseURL: 'https://custom.url/v1' }).chat();

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
      expect(
        config.url({
          modelId: 'zai-org/GLM-5.3-Flash',
          path: '/chat/completions',
        }),
      ).toBe('https://custom.url/v1/chat/completions');
    });

    it('should be exposed via languageModel alias', () => {
      const provider = createNebul();
      provider.languageModel('zai-org/GLM-5.3-Flash');

      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'zai-org/GLM-5.3-Flash',
        expect.objectContaining({
          provider: 'nebul.chat',
        }),
      );
    });

    // An OpenAI-compatible server omits usage from streamed responses unless
    // `stream_options.include_usage` is set, which is what `includeUsage`
    // controls. Non-streaming responses carry usage regardless, so a miss here
    // only shows up on streams.
    describe('includeUsage', () => {
      it('should be set', () => {
        createNebul().chat('zai-org/GLM-5.3-Flash');

        const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
        expect(config.includeUsage).toBe(true);
      });
    });

    // Without this flag the openai-compatible chat model rewrites
    // `response_format: json_schema` to `json_object`, silently discarding the
    // schema, name, and strict flag with only a call warning.
    describe('supportsStructuredOutputs', () => {
      it('should be set', () => {
        createNebul().chat('zai-org/GLM-5.3-Flash');

        const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
        expect(config.supportsStructuredOutputs).toBe(true);
      });
    });
  });

  describe('embeddingModel', () => {
    it('should construct an embedding model with correct configuration', () => {
      const provider = createNebul();
      const modelId = 'sentence-transformers/all-MiniLM-L6-v2';

      const model = provider.embeddingModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
      expect(OpenAICompatibleEmbeddingModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'nebul.embedding',
          maxEmbeddingsPerCall: 2048,
        }),
      );
    });

    it('should be exposed via textEmbeddingModel (deprecated alias)', () => {
      const provider = createNebul();
      provider.textEmbeddingModel('sentence-transformers/all-MiniLM-L6-v2');

      expect(OpenAICompatibleEmbeddingModelMock).toHaveBeenCalledWith(
        'sentence-transformers/all-MiniLM-L6-v2',
        expect.objectContaining({
          provider: 'nebul.embedding',
        }),
      );
    });
  });

  describe('imageModel', () => {
    it('should construct an image model with correct configuration', () => {
      const provider = createNebul();
      const modelId = 'some-image-model';

      const model = provider.imageModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleImageModel);
      expect(OpenAICompatibleImageModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'nebul.image',
        }),
      );
    });
  });

  describe('transcriptionModel', () => {
    it('should construct a transcription model with correct configuration', () => {
      const provider = createNebul();
      const modelId = 'some-transcription-model';

      const model = provider.transcriptionModel(modelId);

      expect(model).toBeInstanceOf(NebulTranscriptionModel);
      expect(model.provider).toBe('nebul.transcription');
      expect(model.modelId).toBe(modelId);
    });
  });

  describe('speechModel', () => {
    it('should construct a speech model with correct configuration', () => {
      const provider = createNebul();
      const modelId = 'some-speech-model';

      const model = provider.speechModel(modelId);

      expect(model).toBeInstanceOf(NebulSpeechModel);
      expect(model.provider).toBe('nebul.speech');
      expect(model.modelId).toBe(modelId);
    });
  });

  describe('rerankingModel', () => {
    it('should construct a reranking model with correct configuration', () => {
      const provider = createNebul();
      const modelId = 'BAAI/bge-reranker-v2-m3';

      const model = provider.rerankingModel(modelId);

      expect(model).toBeInstanceOf(NebulRerankingModel);
      expect(model.provider).toBe('nebul.reranking');
      expect(model.modelId).toBe(modelId);
    });
  });
});
