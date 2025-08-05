import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHuggingFace } from './huggingface-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

const OpenAICompatibleChatLanguageModelMock = vi.mocked(
  OpenAICompatibleChatLanguageModel,
);

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
}));

vi.mock('@ai-sdk/provider-utils', () => ({
  loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
  withoutTrailingSlash: vi.fn(url => url?.replace(/\/$/, '') ?? url),
}));

describe('HuggingFaceProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createHuggingFace', () => {
    it('should create provider with default configuration', () => {
      const provider = createHuggingFace();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe('model-id');
      expect(constructorCall[1]).toMatchInlineSnapshot(`
        {
          "fetch": undefined,
          "headers": [Function],
          "provider": "huggingface.chat",
          "url": [Function],
        }
      `);

      // Trigger headers function to test loadApiKey call
      constructorCall[1].headers();
      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'HF_TOKEN',
        description: 'Hugging Face',
      });
    });

    it('should create provider with custom configuration', () => {
      const options = {
        apiKey: 'custom-api-key',
        baseURL: 'https://custom.url/v1',
        headers: { 'Custom-Header': 'value' },
        fetch: vi.fn(),
      };
      const provider = createHuggingFace(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      expect(constructorCall[1].fetch).toBe(options.fetch);

      // Trigger headers function to test loadApiKey call
      constructorCall[1].headers();
      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-api-key',
        environmentVariableName: 'HF_TOKEN',
        description: 'Hugging Face',
      });
    });

    it('should construct correct headers', () => {
      const options = {
        apiKey: 'test-api-key',
        headers: { 'Custom-Header': 'custom-value' },
      };
      const provider = createHuggingFace(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const headers = constructorCall[1].headers();

      expect(headers).toMatchInlineSnapshot(`
        {
          "Authorization": "Bearer mock-api-key",
          "Custom-Header": "custom-value",
        }
      `);
    });

    it('should construct correct URL', () => {
      const provider = createHuggingFace({
        baseURL: 'https://custom.url/v1',
      });
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const url = constructorCall[1].url({
        modelId: 'model-id',
        path: '/chat/completions',
      });

      expect(url).toBe('https://custom.url/v1/chat/completions');
    });
  });

  describe('model creation methods', () => {
    it('should create chat model when called as function', () => {
      const provider = createHuggingFace();
      const model = provider('meta-llama/Llama-3.1-8B-Instruct');

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'meta-llama/Llama-3.1-8B-Instruct',
        expect.objectContaining({
          provider: 'huggingface.chat',
        }),
      );
    });

    it('should support model:provider format', () => {
      const provider = createHuggingFace();
      const model = provider('deepseek-ai/DeepSeek-V3-0324:sambanova');

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'deepseek-ai/DeepSeek-V3-0324:sambanova',
        expect.objectContaining({
          provider: 'huggingface.chat',
        }),
      );
    });

    it('should create chat model using chat method', () => {
      const provider = createHuggingFace();
      const model = provider.chat('meta-llama/Llama-3.1-8B-Instruct');

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'meta-llama/Llama-3.1-8B-Instruct',
        expect.objectContaining({
          provider: 'huggingface.chat',
        }),
      );
    });

    it('should create language model using languageModel method', () => {
      const provider = createHuggingFace();
      const model = provider.languageModel('meta-llama/Llama-3.1-8B-Instruct');

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'meta-llama/Llama-3.1-8B-Instruct',
        expect.objectContaining({
          provider: 'huggingface.chat',
        }),
      );
    });
  });

  describe('unsupported model types', () => {
    it('should throw NoSuchModelError for text embedding models', () => {
      const provider = createHuggingFace();

      expect(() => provider.textEmbeddingModel('any-model')).toThrowError(
        expect.objectContaining({
          message: expect.stringContaining(
            'Hugging Face OpenAI-compatible API does not support text embeddings',
          ),
        }),
      );
    });

    it('should throw NoSuchModelError for image models', () => {
      const provider = createHuggingFace();

      expect(() => provider.imageModel('any-model')).toThrowError(
        expect.objectContaining({
          message: expect.stringContaining(
            'Hugging Face OpenAI-compatible API does not support image generation',
          ),
        }),
      );
    });
  });

  describe('provider metadata', () => {
    it('should use correct provider name', () => {
      const provider = createHuggingFace();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      expect(constructorCall[1].provider).toBe('huggingface.chat');
    });

    it('should use default base URL', () => {
      const provider = createHuggingFace();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const url = constructorCall[1].url({
        modelId: 'model-id',
        path: '/chat/completions',
      });

      expect(url).toBe('https://router.huggingface.co/v1/chat/completions');
    });
  });
});
