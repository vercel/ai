import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createCrusoe } from './crusoe-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

// Add type assertion for the mocked class
const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
}));

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
    withoutTrailingSlash: vi.fn(url => url),
  };
});

describe('CrusoeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCrusoe', () => {
    it('should create a CrusoeProvider instance with default options', () => {
      const provider = createCrusoe();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers!();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'CRUSOE_API_KEY',
        description: 'Crusoe API key',
      });
    });

    it('should create a CrusoeProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createCrusoe(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers!();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'CRUSOE_API_KEY',
        description: 'Crusoe API key',
      });
    });

    it('should pass header with correct user agent', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const provider = createCrusoe({ fetch: fetchMock });
      provider('model-id');

      const constructorCall = vi.mocked(OpenAICompatibleChatLanguageModel).mock
        .calls[0];
      const config = constructorCall[1];
      const headers = config.headers!();

      await fetchMock('https://api.inference.crusoecloud.com/v1/test', {
        method: 'POST',
        headers,
      });

      expect(fetchMock.mock.calls[0][1].headers['user-agent']).toContain(
        'ai-sdk/crusoe/0.0.0-test',
      );
    });

    it('should return a chat model when called as a function', () => {
      const provider = createCrusoe();
      const modelId = 'meta-llama/Llama-3.3-70B-Instruct';

      const model = provider(modelId);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });

    it('should use the correct provider name', () => {
      const provider = createCrusoe();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      expect(config.provider).toBe('crusoe.chat');
    });

    it('should use the correct base URL', () => {
      const provider = createCrusoe();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      expect(config.url({ path: '/chat/completions' })).toBe(
        'https://api.inference.crusoecloud.com/v1/chat/completions',
      );
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct configuration', () => {
      const provider = createCrusoe();
      const modelId = 'deepseek-ai/DeepSeek-V3-0324';

      const model = provider.languageModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createCrusoe();
      const modelId = 'qwen/Qwen3-235B-A22B';

      const model = provider.chat(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('embeddingModel', () => {
    it('should throw NoSuchModelError when attempting to create embedding model', () => {
      const provider = createCrusoe();

      expect(() => provider.embeddingModel('any-model')).toThrow(
        'No such embeddingModel: any-model',
      );
    });
  });

  describe('imageModel', () => {
    it('should throw NoSuchModelError when attempting to create image model', () => {
      const provider = createCrusoe();

      expect(() => provider.imageModel('any-model')).toThrow(
        'No such imageModel: any-model',
      );
    });
  });
});
