import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createFireworks } from './fireworks-provider';
import { LanguageModelV2, EmbeddingModelV2 } from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import { FireworksImageModel } from './fireworks-image-model';

// Add type assertion for the mocked class
const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;

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
    OpenAICompatibleChatLanguageModel: createMockConstructor('fireworks.chat'),
    OpenAICompatibleCompletionLanguageModel: createMockConstructor(
      'fireworks.completion',
    ),
    OpenAICompatibleEmbeddingModel: createMockConstructor(
      'fireworks.embedding',
    ),
  };
});

vi.mock('@ai-sdk/provider-utils', () => ({
  loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
  withoutTrailingSlash: vi.fn(url => url),
}));

vi.mock('./fireworks-image-model', () => ({
  FireworksImageModel: vi.fn(),
}));

describe('FireworksProvider', () => {
  let mockLanguageModel: LanguageModelV2;
  let mockEmbeddingModel: EmbeddingModelV2<string>;

  beforeEach(() => {
    // Mock implementations of models
    mockLanguageModel = {
      // Add any required methods for LanguageModelV2
    } as LanguageModelV2;
    mockEmbeddingModel = {
      // Add any required methods for EmbeddingModelV2
    } as EmbeddingModelV2<string>;

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
      const config = constructorCall[1];
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
      const config = constructorCall[1];
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

      const model = provider(modelId);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createFireworks();
      const modelId = 'fireworks-chat-model';

      const model = provider.chatModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('completionModel', () => {
    it('should construct a completion model with correct configuration', () => {
      const provider = createFireworks();
      const modelId = 'fireworks-completion-model';

      const model = provider.completionModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleCompletionLanguageModel);
    });
  });

  describe('textEmbeddingModel', () => {
    it('should construct a text embedding model with correct configuration', () => {
      const provider = createFireworks();
      const modelId = 'fireworks-embedding-model';

      const model = provider.textEmbeddingModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
    });
  });

  describe('image', () => {
    it('should construct an image model with correct configuration', () => {
      const provider = createFireworks();
      const modelId = 'accounts/fireworks/models/flux-1-dev-fp8';

      const model = provider.image(modelId);

      expect(model).toBeInstanceOf(FireworksImageModel);
      expect(FireworksImageModel).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'fireworks.image',
          baseURL: 'https://api.fireworks.ai/inference/v1',
        }),
      );
    });

    it('should use default settings when none provided', () => {
      const provider = createFireworks();
      const modelId = 'accounts/fireworks/models/flux-1-dev-fp8';

      const model = provider.image(modelId);

      expect(model).toBeInstanceOf(FireworksImageModel);
      expect(FireworksImageModel).toHaveBeenCalledWith(
        modelId,
        expect.any(Object),
      );
    });

    it('should respect custom baseURL', () => {
      const customBaseURL = 'https://custom.api.fireworks.ai';
      const provider = createFireworks({ baseURL: customBaseURL });
      const modelId = 'accounts/fireworks/models/flux-1-dev-fp8';

      provider.image(modelId);

      expect(FireworksImageModel).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          baseURL: customBaseURL,
        }),
      );
    });
  });
});
