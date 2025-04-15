import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createCerebras } from './cerebras-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

// Add type assertion for the mocked class
const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
}));

vi.mock('@ai-sdk/provider-utils', () => ({
  loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
  withoutTrailingSlash: vi.fn(url => url),
}));

describe('CerebrasProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCerebras', () => {
    it('should create a CerebrasProvider instance with default options', () => {
      const provider = createCerebras();
      const model = provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'CEREBRAS_API_KEY',
        description: 'Cerebras API key',
      });
    });

    it('should create a CerebrasProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createCerebras(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'CEREBRAS_API_KEY',
        description: 'Cerebras API key',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createCerebras();
      const modelId = 'foo-model-id';

      const model = provider(modelId);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct configuration', () => {
      const provider = createCerebras();
      const modelId = 'foo-model-id';

      const model = provider.languageModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('textEmbeddingModel', () => {
    it('should throw NoSuchModelError when attempting to create embedding model', () => {
      const provider = createCerebras();

      expect(() => provider.textEmbeddingModel('any-model')).toThrow(
        'No such textEmbeddingModel: any-model',
      );
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createCerebras();
      const modelId = 'foo-model-id';

      const model = provider.chat(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });
});
