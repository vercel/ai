import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createOVHcloud } from './ovhcloud-provider';
import {
  LanguageModelV3,
  EmbeddingModelV3,
  ImageModelV3,
} from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
  OpenAICompatibleImageModel,
} from '@ai-sdk/openai-compatible';

// Add type assertion for the mocked class
const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;

const OpenAICompatibleEmbeddingModelMock =
  OpenAICompatibleEmbeddingModel as unknown as Mock;

const OpenAICompatibleImageModelMock =
  OpenAICompatibleImageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => {
  // Create mock constructor functions that behave like classes
  const createMockConstructor = (providerName: string) => {
    const mockConstructor = vi.fn().mockImplementation(function (
      this: any,
      modelId: string,
      settings: any,
    ) {
      this.provider = providerName;
      this.modelId = modelId;
      this.settings = settings;
    });
    return mockConstructor;
  };

  return {
    OpenAICompatibleChatLanguageModel: createMockConstructor('ovhcloud.chat'),
    OpenAICompatibleEmbeddingModel: createMockConstructor('ovhcloud.embedding'),
    OpenAICompatibleImageModel: createMockConstructor('ovhcloud.image'),
  };
});

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
    withoutTrailingSlash: vi.fn(url => url),
    withUserAgentSuffix: vi.fn((headers, suffix) => ({
      ...headers,
      'user-agent': suffix,
    })),
  };
});

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

describe('OVHcloudProvider', () => {
  let mockLanguageModel: LanguageModelV3;
  let mockEmbeddingModel: EmbeddingModelV3<string>;
  let mockImageModel: ImageModelV3;

  beforeEach(() => {
    // Mock implementations of models
    mockLanguageModel = {} as LanguageModelV3;
    mockEmbeddingModel = {} as EmbeddingModelV3<string>;
    mockImageModel = {} as ImageModelV3;

    vi.clearAllMocks();
  });

  describe('createOVHcloud', () => {
    it('should create an OVHcloudProvider instance with default options', () => {
      const provider = createOVHcloud();
      const model = provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'OVHCLOUD_AI_ENPOINTS_API_KEY',
        description: 'OVHcloud AI Endpoints API key',
      });
    });

    it('should create an OVHcloudProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createOVHcloud(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'OVHCLOUD_AI_ENPOINTS_API_KEY',
        description: 'OVHcloud AI Endpoints API key',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createOVHcloud();
      const modelId = 'test-model-id';

      const model = provider(modelId);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });

    it('should include OVHcloud version in user-agent header', () => {
      const provider = createOVHcloud();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(headers['user-agent']).toContain(
        'vercel-ai-sdk/ovhcloud/0.0.0-test',
      );
    });

    it('should use default base URL when not provided', () => {
      const provider = createOVHcloud();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const url = config.url({ path: '/chat/completions' });

      expect(url).toBe(
        'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions',
      );
    });

    it('should use custom base URL when provided', () => {
      const customBaseURL = 'https://custom.api.ovhcloud.net/v1';
      const provider = createOVHcloud({ baseURL: customBaseURL });
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const url = config.url({ path: '/chat/completions' });

      expect(url).toBe(`${customBaseURL}/chat/completions`);
    });
  });

  describe('chat completions', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createOVHcloud();
      const modelId = 'ovhcloud-chat-model';

      const model = provider.chat(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'ovhcloud.chat',
        }),
      );
    });

    it('should construct a language model with correct configuration', () => {
      const provider = createOVHcloud();
      const modelId = 'ovhcloud-language-model';

      const model = provider.languageModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'ovhcloud.chat',
        }),
      );
    });

    it('should use correct URL path for chat completions', () => {
      const provider = createOVHcloud();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const url = config.url({ path: '/chat/completions' });

      expect(url).toBe(
        'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions',
      );
    });

    it('should include custom headers when provided', () => {
      const customHeaders = { 'X-Custom-Header': 'custom-value' };
      const provider = createOVHcloud({ headers: customHeaders });
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(headers['X-Custom-Header']).toBe('custom-value');
    });
  });

  describe('text embeddings', () => {
    it('should construct a text embedding model with correct configuration', () => {
      const provider = createOVHcloud();
      const modelId = 'ovhcloud-embedding-model';

      const model = provider.textEmbeddingModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
      expect(OpenAICompatibleEmbeddingModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'ovhcloud.embedding',
        }),
      );
    });

    it('should use correct URL path for embeddings', () => {
      const provider = createOVHcloud();
      provider.textEmbeddingModel('model-id');

      const constructorCall = OpenAICompatibleEmbeddingModelMock.mock.calls[0];
      const config = constructorCall[1];
      const url = config.url({ path: '/embeddings' });

      expect(url).toBe(
        'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/embeddings',
      );
    });

    it('should include authorization header for embeddings', () => {
      const provider = createOVHcloud({ apiKey: 'test-api-key' });
      provider.textEmbeddingModel('model-id');

      const constructorCall = OpenAICompatibleEmbeddingModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        environmentVariableName: 'OVHCLOUD_AI_ENPOINTS_API_KEY',
        description: 'OVHcloud AI Endpoints API key',
      });
    });

    it('should support custom fetch function for embeddings', () => {
      const customFetch = vi.fn();
      const provider = createOVHcloud({ fetch: customFetch });
      provider.textEmbeddingModel('model-id');

      const constructorCall = OpenAICompatibleEmbeddingModelMock.mock.calls[0];
      const config = constructorCall[1];

      expect(config.fetch).toBe(customFetch);
    });
  });

  describe('image generation', () => {
    it('should construct an image model with correct configuration', () => {
      const provider = createOVHcloud();
      const modelId = 'ovhcloud-image-model';

      const model = provider.imageModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleImageModel);
      expect(OpenAICompatibleImageModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'ovhcloud.image',
        }),
      );
    });

    it('should use correct URL path for image generation', () => {
      const provider = createOVHcloud();
      provider.imageModel('model-id');

      const constructorCall = OpenAICompatibleImageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const url = config.url({ path: '/images/generations' });

      expect(url).toBe(
        'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/images/generations',
      );
    });

    it('should include authorization header for image generation', () => {
      const provider = createOVHcloud({ apiKey: 'test-api-key' });
      provider.imageModel('model-id');

      const constructorCall = OpenAICompatibleImageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        environmentVariableName: 'OVHCLOUD_AI_ENPOINTS_API_KEY',
        description: 'OVHcloud AI Endpoints API key',
      });
    });

    it('should support custom base URL for image generation', () => {
      const customBaseURL = 'https://custom.image.api.ovhcloud.net/v1';
      const provider = createOVHcloud({ baseURL: customBaseURL });
      provider.imageModel('model-id');

      const constructorCall = OpenAICompatibleImageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const url = config.url({ path: '/images/generations' });

      expect(url).toBe(`${customBaseURL}/images/generations`);
    });

    it('should support custom fetch function for image generation', () => {
      const customFetch = vi.fn();
      const provider = createOVHcloud({ fetch: customFetch });
      provider.imageModel('model-id');

      const constructorCall = OpenAICompatibleImageModelMock.mock.calls[0];
      const config = constructorCall[1];

      expect(config.fetch).toBe(customFetch);
    });
  });

  describe('provider interface', () => {
    it('should implement all required provider methods', () => {
      const provider = createOVHcloud();

      expect(typeof provider).toBe('function');
      expect(typeof provider.chat).toBe('function');
      expect(typeof provider.languageModel).toBe('function');
      expect(typeof provider.textEmbeddingModel).toBe('function');
      expect(typeof provider.imageModel).toBe('function');
    });

    it('should have correct specification version', () => {
      const provider = createOVHcloud();

      expect(provider.specificationVersion).toBe('v3');
    });

    it('should allow calling provider as function for chat', () => {
      const provider = createOVHcloud();

      const model1 = provider('test-model');
      expect(model1).toBeInstanceOf(OpenAICompatibleChatLanguageModel);

      const model2 = provider('another-model');
      expect(model2).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });
});
