import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createPerplexity } from './perplexity-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
  OpenAICompatibleCompletionLanguageModel: vi.fn(),
  OpenAICompatibleEmbeddingModel: vi.fn(),
}));

vi.mock('@ai-sdk/provider-utils', () => ({
  loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
  withoutTrailingSlash: vi.fn(url => url),
}));

describe('perplexityProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPerplexity', () => {
    it('should create a PerplexityProvider instance with default options', () => {
      const provider = createPerplexity();
      const model = provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'PERPLEXITY_API_KEY',
        description: 'Perplexity',
      });
    });

    it('should create a PerplexityProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createPerplexity(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'PERPLEXITY_API_KEY',
        description: 'Perplexity',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createPerplexity();
      const modelId = 'foo-model-id';
      const settings = { user: 'foo-user' };

      const model = provider(modelId, settings);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createPerplexity();
      const modelId = 'perplexity-chat-model';
      const settings = { user: 'foo-user' };

      const model = provider.chat(modelId, settings);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });
});
