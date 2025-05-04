import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import { LanguageModelV2, EmbeddingModelV2 } from '@ai-sdk/provider';
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
  let mockLanguageModel: LanguageModelV2;
  let mockEmbeddingModel: EmbeddingModelV2<string>;
  let createOpenAICompatibleMock: Mock;

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

  describe('createTogetherAI', () => {
    it('should create a TogetherAIProvider instance with default options', () => {
      const provider = createTogetherAI();
      const model = provider('model-id');

      // Use the mocked version
      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
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
      const config = constructorCall[1];
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

      const model = provider(modelId);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createTogetherAI();
      const modelId = 'together-chat-model';

      const model = provider.chatModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('completionModel', () => {
    it('should construct a completion model with correct configuration', () => {
      const provider = createTogetherAI();
      const modelId = 'together-completion-model';

      const model = provider.completionModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleCompletionLanguageModel);
    });
  });

  describe('textEmbeddingModel', () => {
    it('should construct a text embedding model with correct configuration', () => {
      const provider = createTogetherAI();
      const modelId = 'together-embedding-model';

      const model = provider.textEmbeddingModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
    });
  });

  describe('image', () => {
    it('should construct an image model with correct configuration', () => {
      const provider = createTogetherAI();
      const modelId = 'stabilityai/stable-diffusion-xl';

      const model = provider.image(modelId);

      expect(TogetherAIImageModel).toHaveBeenCalledWith(
        modelId,
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
        expect.objectContaining({
          baseURL: 'https://custom.url/',
        }),
      );
    });
  });
});
