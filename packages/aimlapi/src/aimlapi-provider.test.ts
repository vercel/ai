import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import { LanguageModelV1, EmbeddingModelV1 } from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { AimlapiImageModel } from './aimlapi-image-model';
import { createAIMLAPI } from './aimlapi-provider';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

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

vi.mock('./aimlapi-image-model', () => ({
  AimlapiImageModel: vi.fn(),
}));

describe('AIMLAPIProvider', () => {
  let mockLanguageModel: LanguageModelV1;
  let mockEmbeddingModel: EmbeddingModelV1<string>;

  beforeEach(() => {
    mockLanguageModel = {} as LanguageModelV1;
    mockEmbeddingModel = {} as EmbeddingModelV1<string>;
    vi.clearAllMocks();
  });

  describe('createAIMLAPI', () => {
    it('should create an AIMLAPIProvider instance with default options', () => {
      const provider = createAIMLAPI();
      const model = provider('model-id');
      const constructorCall = OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      config.headers();
      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'AIMLAPI_API_KEY',
        description: 'AIMLAPI API key',
      });
    });

    it('should create an AIMLAPIProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createAIMLAPI(options);
      const model = provider('model-id');
      const constructorCall = OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      config.headers();
      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'AIMLAPI_API_KEY',
        description: 'AIMLAPI API key',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createAIMLAPI();
      const model = provider('foo-model-id', { user: 'foo-user' });
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createAIMLAPI();
      const model = provider.chatModel('aimlapi-chat-model', { user: 'foo-user' });
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('completionModel', () => {
    it('should construct a completion model with correct configuration', () => {
      const provider = createAIMLAPI();
      const model = provider.completionModel('aimlapi-completion-model', {
        user: 'foo-user',
      });
      expect(model).toBeInstanceOf(OpenAICompatibleCompletionLanguageModel);
    });
  });

  describe('textEmbeddingModel', () => {
    it('should construct a text embedding model with correct configuration', () => {
      const provider = createAIMLAPI();
      const model = provider.textEmbeddingModel('aimlapi-embedding-model', {
        user: 'foo-user',
      });
      expect(model).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
    });
  });

  describe('imageModel', () => {
    it('should construct an image model with correct configuration', () => {
      const provider = createAIMLAPI();
      const modelId = 'dall-e-2';
      const settings = { maxImagesPerCall: 2 };
      const model = provider.imageModel!(modelId as any, settings);
      expect(AimlapiImageModel).toHaveBeenCalledWith(
        modelId,
        settings,
        expect.objectContaining({
          provider: 'aimlapi.image',
          baseURL: 'https://api.aimlapi.com/v1',
        }),
      );
      expect(model).toBeInstanceOf(AimlapiImageModel);
    });

    it('should pass custom baseURL to image model', () => {
      const provider = createAIMLAPI({ baseURL: 'https://custom.url/' });
      const modelId = 'dall-e-2';
      provider.imageModel!(modelId as any);
      expect(AimlapiImageModel).toHaveBeenCalledWith(
        modelId,
        expect.any(Object),
        expect.objectContaining({ baseURL: 'https://custom.url/' }),
      );
    });
  });
});
