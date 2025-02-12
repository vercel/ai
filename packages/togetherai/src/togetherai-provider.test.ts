import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import { LanguageModelV1, EmbeddingModelV1 } from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { TogetherAIImageModel } from './togetherai-image-model';
import { createTogetherAI } from './togetherai-provider';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

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

vi.mock('./togetherai-image-model', () => ({
  TogetherAIImageModel: vi.fn(),
}));

describe('TogetherAIProvider', () => {
  let mockLanguageModel: LanguageModelV1;
  let mockEmbeddingModel: EmbeddingModelV1<string>;
  let createOpenAICompatibleMock: Mock;

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

  describe('createTogetherAI', () => {
    it('should create a TogetherAIProvider instance with default options', () => {
      const provider = createTogetherAI();
      const model = provider('model-id');

      // Use the mocked version
      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'TOGETHER_AI_API_KEY',
        description: 'TogetherAI',
      });
    });

    it('should create a TogetherAIProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createTogetherAI(options);
      const model = provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'TOGETHER_AI_API_KEY',
        description: 'TogetherAI',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createTogetherAI();
      const modelId = 'foo-model-id';
      const settings = { user: 'foo-user' };

      const model = provider(modelId, settings);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createTogetherAI();
      const modelId = 'together-chat-model';
      const settings = { user: 'foo-user' };

      const model = provider.chatModel(modelId, settings);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('completionModel', () => {
    it('should construct a completion model with correct configuration', () => {
      const provider = createTogetherAI();
      const modelId = 'together-completion-model';
      const settings = { user: 'foo-user' };

      const model = provider.completionModel(modelId, settings);

      expect(model).toBeInstanceOf(OpenAICompatibleCompletionLanguageModel);
    });
  });

  describe('textEmbeddingModel', () => {
    it('should construct a text embedding model with correct configuration', () => {
      const provider = createTogetherAI();
      const modelId = 'together-embedding-model';
      const settings = { user: 'foo-user' };

      const model = provider.textEmbeddingModel(modelId, settings);

      expect(model).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
    });
  });

  describe('image', () => {
    it('should construct an image model with correct configuration', () => {
      const provider = createTogetherAI();
      const modelId = 'stabilityai/stable-diffusion-xl';
      const settings = { maxImagesPerCall: 4 };

      const model = provider.image(modelId, settings);

      expect(TogetherAIImageModel).toHaveBeenCalledWith(
        modelId,
        settings,
        expect.objectContaining({
          provider: 'togetherai.image',
          baseURL: 'https://api.together.xyz/v1/',
        }),
      );
      expect(model).toBeInstanceOf(TogetherAIImageModel);
    });

    it('should pass custom baseURL to image model', () => {
      const provider = createTogetherAI({
        baseURL: 'https://custom.url/',
      });
      const modelId = 'stabilityai/stable-diffusion-xl';

      provider.image(modelId);

      expect(TogetherAIImageModel).toHaveBeenCalledWith(
        modelId,
        expect.any(Object),
        expect.objectContaining({
          baseURL: 'https://custom.url/',
        }),
      );
    });
  });
});
