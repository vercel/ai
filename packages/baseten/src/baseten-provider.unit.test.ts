import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createBaseten } from './baseten-provider';
import {
  LanguageModelV4,
  EmbeddingModelV4,
  NoSuchModelError,
} from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';

// Mock the OpenAI-compatible classes
const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;
const OpenAICompatibleEmbeddingModelMock =
  OpenAICompatibleEmbeddingModel as unknown as Mock;

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
    OpenAICompatibleChatLanguageModel: createMockConstructor('baseten.chat'),
    OpenAICompatibleEmbeddingModel: createMockConstructor('baseten.embedding'),
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

/**
 * Stands in for `@basetenlabs/performance-client`'s `PerformanceClient`. The
 * provider takes the constructor as an option, so tests inject a fake rather
 * than mocking the native module — nothing here loads a `.node` binary, which
 * is what lets these run under the edge environment too.
 */
function createFakePerformanceClient(
  embedResponse: unknown = {
    data: [{ embedding: [0.1, 0.2] }],
    usage: { total_tokens: 7 },
  },
) {
  const embed = vi.fn().mockResolvedValue(embedResponse);
  const constructorCalls: Array<[string, string | undefined]> = [];
  const FakePerformanceClient = vi.fn().mockImplementation(function (
    this: any,
    baseUrl: string,
    apiKey?: string,
  ) {
    constructorCalls.push([baseUrl, apiKey]);
    this.embed = embed;
  });
  return { FakePerformanceClient, embed, constructorCalls };
}

describe('BasetenProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createBaseten', () => {
    it('should create a BasetenProvider instance with default options', () => {
      const provider = createBaseten();
      const model = provider.chatModel('deepseek-ai/DeepSeek-V3-0324');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'BASETEN_API_KEY',
        description: 'Baseten API key',
      });
      expect(headers.authorization).toBe('Bearer mock-api-key');
      expect(config.provider).toBe('baseten.chat');
    });

    it('should create a BasetenProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createBaseten(options);
      const model = provider.chatModel('deepseek-ai/DeepSeek-V3-0324');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'BASETEN_API_KEY',
        description: 'Baseten API key',
      });
      expect(headers['custom-header']).toBe('value');
    });

    it('should support optional modelId parameter', () => {
      const provider = createBaseten();

      // Should work without modelId
      const model1 = provider();
      expect(model1).toBeInstanceOf(OpenAICompatibleChatLanguageModel);

      // Should work with modelId
      const model2 = provider('deepseek-ai/DeepSeek-V3-0324');
      expect(model2).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model with correct configuration for default Model APIs', () => {
      const provider = createBaseten();
      const modelId = 'deepseek-ai/DeepSeek-V3-0324';

      const model = provider.chatModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'baseten.chat',
          errorStructure: expect.any(Object),
        }),
      );
    });

    // An OpenAI-compatible server omits usage from streamed responses unless
    // `stream_options.include_usage` is set, which is what `includeUsage`
    // controls. Non-streaming responses carry usage regardless, so a miss here
    // only shows up on streams.
    describe('includeUsage', () => {
      it('should be set for the default Model APIs path', () => {
        createBaseten().chatModel('deepseek-ai/DeepSeek-V3-0324');

        const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
        expect(config.includeUsage).toBe(true);
      });

      it('should be set for a dedicated /sync/v1 deployment', () => {
        createBaseten({
          modelURL:
            'https://model-123.api.baseten.co/environments/production/sync/v1',
        }).chatModel();

        const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
        expect(config.includeUsage).toBe(true);
      });
    });

    // Without this flag the openai-compatible chat model rewrites
    // `response_format: json_schema` to `json_object`, silently discarding the
    // schema, name, and strict flag with only a call warning.
    describe('supportsStructuredOutputs', () => {
      it('should be set for the default Model APIs path', () => {
        createBaseten().chatModel('deepseek-ai/DeepSeek-V3-0324');

        const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
        expect(config.supportsStructuredOutputs).toBe(true);
      });

      it('should be set for a dedicated /sync/v1 deployment', () => {
        createBaseten({
          modelURL:
            'https://model-123.api.baseten.co/environments/production/sync/v1',
        }).chatModel();

        const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
        expect(config.supportsStructuredOutputs).toBe(true);
      });
    });

    // Baseten sends a bare string from the Model APIs but lets dedicated
    // deployments pass through their server's OpenAI-shaped object, so the
    // schema has to accept both. A failed parse degrades the message to the
    // HTTP reason phrase — "Not Found" over HTTP/1.1, "" over HTTP/2.
    describe('errorStructure', () => {
      const getErrorStructure = () => {
        createBaseten().chatModel('test-model');
        return OpenAICompatibleChatLanguageModelMock.mock.calls[0][1]
          .errorStructure;
      };

      it('should parse the string envelope the Model APIs return', () => {
        const { errorSchema, errorToMessage } = getErrorStructure();

        const parsed = errorSchema.parse({
          error: 'please check the model you provided',
        });

        expect(errorToMessage(parsed)).toBe(
          'please check the model you provided',
        );
      });

      it('should parse the object envelope a dedicated deployment returns', () => {
        const { errorSchema, errorToMessage } = getErrorStructure();

        const parsed = errorSchema.parse({
          error: {
            code: 404,
            message: 'The model `not-a-real-model` does not exist.',
            param: 'model',
            type: 'NotFoundError',
          },
        });

        expect(errorToMessage(parsed)).toBe(
          'The model `not-a-real-model` does not exist.',
        );
      });

      it('should parse an error object with a null param and string code', () => {
        const { errorSchema, errorToMessage } = getErrorStructure();

        const parsed = errorSchema.parse({
          error: {
            message: 'Invalid value for `temperature`.',
            param: null,
            code: 'invalid_request_error',
            type: 'BadRequestError',
          },
        });

        expect(errorToMessage(parsed)).toBe('Invalid value for `temperature`.');
      });

      it('should ignore unknown keys alongside the error', () => {
        const { errorSchema, errorToMessage } = getErrorStructure();

        const parsed = errorSchema.parse({
          error: { message: 'Model not found' },
          request_id: 'chatcmpl-abc123',
        });

        expect(errorToMessage(parsed)).toBe('Model not found');
      });

      it('should reject an error object without a message', () => {
        const { errorSchema } = getErrorStructure();

        expect(() => errorSchema.parse({ error: { code: 404 } })).toThrow();
      });
    });

    it('should construct a chat model with optional modelId', () => {
      const provider = createBaseten();

      // Should work without modelId
      const model1 = provider.chatModel();
      expect(model1).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'chat',
        expect.any(Object),
      );

      // Should work with modelId
      const model2 = provider.chatModel('deepseek-ai/DeepSeek-V3-0324');
      expect(model2).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });

    it('should handle /sync/v1 endpoints correctly', () => {
      const provider = createBaseten({
        modelURL:
          'https://model-123.api.baseten.co/environments/production/sync/v1',
      });

      const model = provider.chatModel();

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'placeholder',
        expect.objectContaining({
          provider: 'baseten.chat',
          url: expect.any(Function),
          errorStructure: expect.any(Object),
        }),
      );

      // Test URL construction
      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const url = config.url({ path: '/chat/completions' });
      expect(url).toBe(
        'https://model-123.api.baseten.co/environments/production/sync/v1/chat/completions',
      );
    });

    it('should throw error for /predict endpoints with chat models', () => {
      const provider = createBaseten({
        modelURL:
          'https://model-123.api.baseten.co/environments/production/predict',
      });

      expect(() => {
        provider.chatModel();
      }).toThrow(
        'Not supported. You must use a /sync/v1 endpoint for chat models.',
      );
    });
  });

  describe('languageModel', () => {
    it('should be an alias for chatModel', () => {
      const provider = createBaseten();
      const modelId = 'deepseek-ai/DeepSeek-V3-0324';

      const chatModel = provider.chatModel(modelId);
      const languageModel = provider.languageModel(modelId);

      expect(chatModel).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(languageModel).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });

    it('should support optional modelId parameter', () => {
      const provider = createBaseten();

      const model1 = provider.languageModel();
      expect(model1).toBeInstanceOf(OpenAICompatibleChatLanguageModel);

      const model2 = provider.languageModel('deepseek-ai/DeepSeek-V3-0324');
      expect(model2).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('textEmbeddingModel', () => {
    it('should throw error when no modelURL is provided', () => {
      const provider = createBaseten();

      expect(() => {
        provider.embeddingModel();
      }).toThrow(
        'No model URL provided for embeddings. Please set modelURL option for embeddings.',
      );
    });

    it('should construct embedding model for /sync endpoints', () => {
      const provider = createBaseten({
        modelURL:
          'https://model-123.api.baseten.co/environments/production/sync',
      });

      const model = provider.embeddingModel();

      expect(model).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
      expect(OpenAICompatibleEmbeddingModelMock).toHaveBeenCalledWith(
        'embeddings',
        expect.objectContaining({
          provider: 'baseten.embedding',
          url: expect.any(Function),
          errorStructure: expect.any(Object),
        }),
      );

      // Test URL construction for embeddings (Performance Client adds /v1/embeddings)
      const constructorCall = OpenAICompatibleEmbeddingModelMock.mock.calls[0];
      const config = constructorCall[1];
      const url = config.url({ path: '/embeddings' });
      expect(url).toBe(
        'https://model-123.api.baseten.co/environments/production/sync/v1/embeddings',
      );
    });

    it('should throw error for /predict endpoints (not supported with Performance Client)', () => {
      const provider = createBaseten({
        modelURL:
          'https://model-123.api.baseten.co/environments/production/predict',
      });

      expect(() => {
        provider.embeddingModel();
      }).toThrow(
        'Not supported. You must use a /sync or /sync/v1 endpoint for embeddings.',
      );
    });

    it('should support /sync/v1 endpoints (strips /v1 before passing to Performance Client)', () => {
      const provider = createBaseten({
        modelURL:
          'https://model-123.api.baseten.co/environments/production/sync/v1',
      });

      const model = provider.embeddingModel();

      expect(model).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
      expect(OpenAICompatibleEmbeddingModelMock).toHaveBeenCalledWith(
        'embeddings',
        expect.any(Object),
      );
    });

    it('should support custom modelId for embeddings', () => {
      const provider = createBaseten({
        modelURL:
          'https://model-123.api.baseten.co/environments/production/sync',
      });

      const model = provider.embeddingModel();

      expect(model).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
      expect(OpenAICompatibleEmbeddingModelMock).toHaveBeenCalledWith(
        'embeddings',
        expect.any(Object),
      );
    });

    // BEI embedding deployments are OpenAI-compatible, so plain HTTP is the
    // default and the native performance client is opt-in.
    describe('default (plain HTTP) path', () => {
      const MODEL_URL =
        'https://model-123.api.baseten.co/environments/production/sync';

      it('should not replace doEmbed when no performanceClient is given', () => {
        const provider = createBaseten({ modelURL: MODEL_URL });

        const model = provider.embeddingModel() as any;

        // The mocked base class installs doEmbed as a vi.fn(); an override
        // would have replaced it with a plain async function.
        expect(vi.isMockFunction(model.doEmbed)).toBe(true);
      });

      it('should cap embeddings per call at 128 so embedMany splits larger inputs', () => {
        const provider = createBaseten({ modelURL: MODEL_URL });

        provider.embeddingModel();

        const config = OpenAICompatibleEmbeddingModelMock.mock.calls[0][1];
        expect(config.maxEmbeddingsPerCall).toBe(128);
      });
    });

    describe('opt-in performance client path', () => {
      const MODEL_URL =
        'https://model-123.api.baseten.co/environments/production/sync';

      it('should construct the injected client with the /sync URL and api key', () => {
        const { FakePerformanceClient, constructorCalls } =
          createFakePerformanceClient();
        const provider = createBaseten({
          modelURL: MODEL_URL,
          performanceClient: FakePerformanceClient,
        });

        provider.embeddingModel();

        expect(constructorCalls).toEqual([[MODEL_URL, 'mock-api-key']]);
      });

      it('should strip /v1 from a /sync/v1 modelURL, since the client adds it back', () => {
        const { FakePerformanceClient, constructorCalls } =
          createFakePerformanceClient();
        const provider = createBaseten({
          modelURL: `${MODEL_URL}/v1`,
          performanceClient: FakePerformanceClient,
        });

        provider.embeddingModel();

        expect(constructorCalls[0][0]).toBe(MODEL_URL);
      });

      it('should let the client batch everything, rather than capping at 128', () => {
        const { FakePerformanceClient } = createFakePerformanceClient();
        const provider = createBaseten({
          modelURL: MODEL_URL,
          performanceClient: FakePerformanceClient,
        });

        provider.embeddingModel();

        const config = OpenAICompatibleEmbeddingModelMock.mock.calls[0][1];
        expect(config.maxEmbeddingsPerCall).toBe(Number.POSITIVE_INFINITY);
      });

      it('should route doEmbed through the client and map its response', async () => {
        const { FakePerformanceClient, embed } = createFakePerformanceClient({
          data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
          usage: { total_tokens: 11 },
        });
        const provider = createBaseten({
          modelURL: MODEL_URL,
          performanceClient: FakePerformanceClient,
        });

        const model = provider.embeddingModel() as any;
        const result = await model.doEmbed({ values: ['a', 'b'] });

        expect(embed).toHaveBeenCalledWith(['a', 'b'], 'embeddings');
        expect(result.embeddings).toEqual([
          [0.1, 0.2],
          [0.3, 0.4],
        ]);
        expect(result.usage).toEqual({ tokens: 11 });
      });

      it('should omit usage when the client reports no token count', async () => {
        const { FakePerformanceClient } = createFakePerformanceClient({
          data: [{ embedding: [0.1] }],
        });
        const provider = createBaseten({
          modelURL: MODEL_URL,
          performanceClient: FakePerformanceClient,
        });

        const model = provider.embeddingModel() as any;
        const result = await model.doEmbed({ values: ['a'] });

        expect(result.usage).toBeUndefined();
      });

      it('should reject a non-array values argument', async () => {
        const { FakePerformanceClient } = createFakePerformanceClient();
        const provider = createBaseten({
          modelURL: MODEL_URL,
          performanceClient: FakePerformanceClient,
        });

        const model = provider.embeddingModel() as any;

        await expect(model.doEmbed({ values: 'not-an-array' })).rejects.toThrow(
          'params.values must be an array of strings',
        );
      });
    });
  });

  describe('imageModel', () => {
    it('should throw NoSuchModelError for unsupported image models', () => {
      const provider = createBaseten();

      expect(() => {
        provider.imageModel('test-model');
      }).toThrow(NoSuchModelError);
    });
  });

  describe('URL construction', () => {
    it('should use default baseURL when no modelURL is provided', () => {
      const provider = createBaseten();
      const model = provider.chatModel('test-model');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const url = config.url({ path: '/chat/completions' });
      expect(url).toBe('https://inference.baseten.co/v1/chat/completions');
    });

    it('should use custom baseURL when provided', () => {
      const provider = createBaseten({
        baseURL: 'https://custom.baseten.co/v1',
      });
      const model = provider.chatModel('test-model');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const url = config.url({ path: '/chat/completions' });
      expect(url).toBe('https://custom.baseten.co/v1/chat/completions');
    });

    it('should use modelURL for custom endpoints', () => {
      const provider = createBaseten({
        modelURL:
          'https://model-123.api.baseten.co/environments/production/sync/v1',
      });
      const model = provider.chatModel();

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const url = config.url({ path: '/chat/completions' });
      expect(url).toBe(
        'https://model-123.api.baseten.co/environments/production/sync/v1/chat/completions',
      );
    });
  });

  describe('Headers', () => {
    it('should include Authorization header with API key', () => {
      const provider = createBaseten();
      const model = provider.chatModel('test-model');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(headers.authorization).toBe('Bearer mock-api-key');
    });

    it('should include custom headers when provided', () => {
      const provider = createBaseten({
        headers: { 'Custom-Header': 'custom-value' },
      });
      const model = provider.chatModel('test-model');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(headers.authorization).toBe('Bearer mock-api-key');
      expect(headers['custom-header']).toBe('custom-value');
    });

    it('should include user-agent with version', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const provider = createBaseten({ fetch: fetchMock });
      const model = provider.chatModel('test-model');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      await fetchMock('https://example.com/test', {
        method: 'POST',
        headers,
      });

      expect(fetchMock.mock.calls[0][1].headers['user-agent']).toContain(
        'ai-sdk/baseten/0.0.0-test',
      );
    });
  });

  describe('Error handling', () => {
    it('should handle missing modelURL for embeddings gracefully', () => {
      const provider = createBaseten();

      expect(() => {
        provider.embeddingModel();
      }).toThrow(
        'No model URL provided for embeddings. Please set modelURL option for embeddings.',
      );
    });

    it('should handle unsupported image models', () => {
      const provider = createBaseten();

      expect(() => {
        provider.imageModel('unsupported-model');
      }).toThrow(NoSuchModelError);
    });
  });

  describe('Provider interface', () => {
    it('should implement all required provider methods', () => {
      const provider = createBaseten();

      expect(typeof provider).toBe('function');
      expect(typeof provider.chatModel).toBe('function');
      expect(typeof provider.languageModel).toBe('function');
      expect(typeof provider.embeddingModel).toBe('function');
      expect(typeof provider.imageModel).toBe('function');
    });

    it('should allow calling provider as function', () => {
      const provider = createBaseten();

      const model1 = provider();
      expect(model1).toBeInstanceOf(OpenAICompatibleChatLanguageModel);

      const model2 = provider('test-model');
      expect(model2).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });
});
