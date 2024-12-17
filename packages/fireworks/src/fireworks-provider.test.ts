import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createFireworks } from './fireworks-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { LanguageModelV1, EmbeddingModelV1 } from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';

// Add type assertion for the mocked class
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

describe('FireworksProvider', () => {
  let mockLanguageModel: LanguageModelV1;
  let mockEmbeddingModel: EmbeddingModelV1<string>;

  beforeEach(() => {
    // Mock implementations of models
    mockLanguageModel = {
      // Add any required methods for LanguageModelV1
    } as LanguageModelV1;
    mockEmbeddingModel = {
      // Add any required methods for EmbeddingModelV1
    } as EmbeddingModelV1<string>;

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('createFireworks', () => {
    it('should create a FireworksProvider instance with default options', () => {
      const provider = createFireworks();
      const model = provider('model-id');

      // Use the mocked version
      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'FIREWORKS_API_KEY',
        description: 'Fireworks API key',
      });
    });

    it('should create a FireworksProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createFireworks(options);
      const model = provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'FIREWORKS_API_KEY',
        description: 'Fireworks API key',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createFireworks();
      const modelId = 'foo-model-id';
      const settings = { user: 'foo-user' };

      const model = provider(modelId, settings);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createFireworks();
      const modelId = 'fireworks-chat-model';
      const settings = { user: 'foo-user' };

      const model = provider.chatModel(modelId, settings);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('completionModel', () => {
    it('should construct a completion model with correct configuration', () => {
      const provider = createFireworks();
      const modelId = 'fireworks-completion-model';
      const settings = { user: 'foo-user' };

      const model = provider.completionModel(modelId, settings);

      expect(model).toBeInstanceOf(OpenAICompatibleCompletionLanguageModel);
    });
  });

  describe('textEmbeddingModel', () => {
    it('should construct a text embedding model with correct configuration', () => {
      const provider = createFireworks();
      const modelId = 'fireworks-embedding-model';
      const settings = { user: 'foo-user' };

      const model = provider.textEmbeddingModel(modelId, settings);

      expect(model).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
    });
  });
});
