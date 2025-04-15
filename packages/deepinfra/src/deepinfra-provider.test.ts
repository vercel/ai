import { DeepInfraImageModel } from './deepinfra-image-model';
import { createDeepInfra } from './deepinfra-provider';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import { LanguageModelV2, EmbeddingModelV2 } from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
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

vi.mock('./deepinfra-image-model', () => ({
  DeepInfraImageModel: vi.fn(),
}));

describe('DeepInfraProvider', () => {
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

  describe('createDeepInfra', () => {
    it('should create a DeepInfraProvider instance with default options', () => {
      const provider = createDeepInfra();
      const model = provider('model-id');

      // Use the mocked version
      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'DEEPINFRA_API_KEY',
        description: "DeepInfra's API key",
      });
    });

    it('should create a DeepInfraProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createDeepInfra(options);
      const model = provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'DEEPINFRA_API_KEY',
        description: "DeepInfra's API key",
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createDeepInfra();
      const modelId = 'foo-model-id';

      const model = provider(modelId);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createDeepInfra();
      const modelId = 'deepinfra-chat-model';

      const model = provider.chatModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'deepinfra.chat',
          defaultObjectGenerationMode: 'json',
        }),
      );
    });
  });

  describe('completionModel', () => {
    it('should construct a completion model with correct configuration', () => {
      const provider = createDeepInfra();
      const modelId = 'deepinfra-completion-model';

      const model = provider.completionModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleCompletionLanguageModel);
    });
  });

  describe('textEmbeddingModel', () => {
    it('should construct a text embedding model with correct configuration', () => {
      const provider = createDeepInfra();
      const modelId = 'deepinfra-embedding-model';

      const model = provider.textEmbeddingModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
    });
  });

  describe('image', () => {
    it('should construct an image model with correct configuration', () => {
      const provider = createDeepInfra();
      const modelId = 'deepinfra-image-model';
      const settings = { maxImagesPerCall: 2 };

      const model = provider.image(modelId, settings);

      expect(model).toBeInstanceOf(DeepInfraImageModel);
      expect(DeepInfraImageModel).toHaveBeenCalledWith(
        modelId,
        settings,
        expect.objectContaining({
          provider: 'deepinfra.image',
          baseURL: 'https://api.deepinfra.com/v1/inference',
        }),
      );
    });

    it('should use default settings when none provided', () => {
      const provider = createDeepInfra();
      const modelId = 'deepinfra-image-model';

      const model = provider.image(modelId);

      expect(model).toBeInstanceOf(DeepInfraImageModel);
      expect(DeepInfraImageModel).toHaveBeenCalledWith(
        modelId,
        {},
        expect.any(Object),
      );
    });

    it('should respect custom baseURL', () => {
      const customBaseURL = 'https://custom.api.deepinfra.com';
      const provider = createDeepInfra({ baseURL: customBaseURL });
      const modelId = 'deepinfra-image-model';

      const model = provider.image(modelId);

      expect(DeepInfraImageModel).toHaveBeenCalledWith(
        modelId,
        expect.any(Object),
        expect.objectContaining({
          baseURL: `${customBaseURL}/inference`,
        }),
      );
    });
  });
});
