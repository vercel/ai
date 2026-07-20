import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createZai } from './zai-provider';
import { NoSuchModelError } from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

// Mock the OpenAI-compatible chat class
const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => {
  const mockConstructor = vi.fn().mockImplementation(function (
    this: any,
    modelId: string,
    settings: any,
  ) {
    this.provider = 'zai.chat';
    this.modelId = modelId;
    this.settings = settings;
    this.doGenerate = vi.fn();
  });
  return {
    OpenAICompatibleChatLanguageModel: mockConstructor,
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

describe('ZaiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createZai', () => {
    it('should create a ZaiProvider instance with default options', () => {
      const provider = createZai();
      const model = provider.chatModel('glm-5.2');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'ZAI_API_KEY',
        description: 'Z.AI API key',
      });
      expect(headers.authorization).toBe('Bearer mock-api-key');
      expect(config.provider).toBe('zai.chat');
    });

    it('should create a ZaiProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createZai(options);
      const model = provider.chatModel('glm-5.2');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'ZAI_API_KEY',
        description: 'Z.AI API key',
      });
      expect(headers['custom-header']).toBe('value');
    });

    it('should support optional modelId parameter', () => {
      const provider = createZai();

      // Should work without modelId
      const model1 = provider();
      expect(model1).toBeInstanceOf(OpenAICompatibleChatLanguageModel);

      // Should work with modelId
      const model2 = provider('glm-5.2');
      expect(model2).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createZai();
      const modelId = 'glm-5.2';

      const model = provider.chatModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'zai.chat',
        }),
      );
    });

    it('should default the modelId when none is provided', () => {
      const provider = createZai();

      const model = provider.chatModel();

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'glm-5.2',
        expect.any(Object),
      );
    });
  });

  describe('languageModel', () => {
    it('should be an alias for chatModel', () => {
      const provider = createZai();
      const modelId = 'glm-5.2';

      const chatModel = provider.chatModel(modelId);
      const languageModel = provider.languageModel(modelId);

      expect(chatModel).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(languageModel).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });

    it('should support optional modelId parameter', () => {
      const provider = createZai();

      const model1 = provider.languageModel();
      expect(model1).toBeInstanceOf(OpenAICompatibleChatLanguageModel);

      const model2 = provider.languageModel('glm-5.2');
      expect(model2).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('embeddingModel', () => {
    it('should throw NoSuchModelError (embeddings not supported)', () => {
      const provider = createZai();

      expect(() => {
        provider.embeddingModel('embedding-3');
      }).toThrow(NoSuchModelError);
    });
  });

  describe('imageModel', () => {
    it('should throw NoSuchModelError for unsupported image models', () => {
      const provider = createZai();

      expect(() => {
        provider.imageModel('test-model');
      }).toThrow(NoSuchModelError);
    });
  });

  describe('URL construction', () => {
    it('should use default baseURL when none is provided', () => {
      const provider = createZai();
      const model = provider.chatModel('test-model');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const url = config.url({ path: '/chat/completions' });
      expect(url).toBe('https://api.z.ai/api/coding/paas/v4/chat/completions');
    });

    it('should use custom baseURL when provided', () => {
      const provider = createZai({
        baseURL: 'https://custom.example.com/api/paas/v4',
      });
      const model = provider.chatModel('test-model');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const url = config.url({ path: '/chat/completions' });
      expect(url).toBe(
        'https://custom.example.com/api/paas/v4/chat/completions',
      );
    });
  });

  describe('Headers', () => {
    it('should include Authorization header with API key', () => {
      const provider = createZai();
      const model = provider.chatModel('test-model');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(headers.authorization).toBe('Bearer mock-api-key');
    });

    it('should include custom headers when provided', () => {
      const provider = createZai({
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

      const provider = createZai({ fetch: fetchMock });
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
        'ai-sdk/zai/0.0.0-test',
      );
    });
  });

  describe('Provider interface', () => {
    it('should implement all required provider methods', () => {
      const provider = createZai();

      expect(typeof provider).toBe('function');
      expect(typeof provider.chatModel).toBe('function');
      expect(typeof provider.languageModel).toBe('function');
      expect(typeof provider.embeddingModel).toBe('function');
      expect(typeof provider.imageModel).toBe('function');
      expect(provider.specificationVersion).toBe('v4');
    });

    it('should allow calling provider as function', () => {
      const provider = createZai();

      const model1 = provider();
      expect(model1).toBeInstanceOf(OpenAICompatibleChatLanguageModel);

      const model2 = provider('test-model');
      expect(model2).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });
});
