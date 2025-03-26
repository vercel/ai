import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createXai } from './xai-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { OpenAICompatibleImageModel } from '@ai-sdk/openai-compatible';

const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;
const OpenAICompatibleImageModelMock =
  OpenAICompatibleImageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
  OpenAICompatibleCompletionLanguageModel: vi.fn(),
  OpenAICompatibleEmbeddingModel: vi.fn(),
  OpenAICompatibleImageModel: vi.fn(),
}));

vi.mock('./xai-image-model', () => ({
  XaiImageModel: vi.fn(),
}));

vi.mock('@ai-sdk/provider-utils', () => ({
  loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
  withoutTrailingSlash: vi.fn(url => url),
}));

describe('xAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createXAI', () => {
    it('should create an XAIProvider instance with default options', () => {
      const provider = createXai();
      const model = provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'XAI_API_KEY',
        description: 'xAI API key',
      });
    });

    it('should create an XAIProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createXai(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'XAI_API_KEY',
        description: 'xAI API key',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createXai();
      const modelId = 'foo-model-id';
      const settings = { user: 'foo-user' };

      const model = provider(modelId, settings);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createXai();
      const modelId = 'xai-chat-model';
      const settings = { user: 'foo-user' };

      const model = provider.chat(modelId, settings);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('imageModel', () => {
    it('should construct an image model with correct configuration', () => {
      const provider = createXai();
      const modelId = 'grok-2-image';
      const settings = { maxImagesPerCall: 3 };

      const model = provider.imageModel(modelId, settings);

      expect(model).toBeInstanceOf(OpenAICompatibleImageModel);

      const constructorCall = OpenAICompatibleImageModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe(modelId);
      expect(constructorCall[1]).toEqual(settings);

      const config = constructorCall[2];
      expect(config.provider).toBe('xai.image');
      expect(config.url({ path: '/test-path' })).toBe(
        'https://api.x.ai/v1/test-path',
      );
    });

    it('should use custom baseURL for image model', () => {
      const customBaseURL = 'https://custom.xai.api';
      const provider = createXai({ baseURL: customBaseURL });
      const modelId = 'grok-2-image';

      provider.imageModel(modelId);

      const constructorCall = OpenAICompatibleImageModelMock.mock.calls[0];
      const config = constructorCall[2];
      expect(config.url({ path: '/test-path' })).toBe(
        `${customBaseURL}/test-path`,
      );
    });

    it('should pass custom headers to image model', () => {
      const customHeaders = { 'Custom-Header': 'test-value' };
      const provider = createXai({ headers: customHeaders });

      provider.imageModel('grok-2-image');

      const constructorCall = OpenAICompatibleImageModelMock.mock.calls[0];
      const config = constructorCall[2];
      const headers = config.headers();

      expect(headers).toMatchObject({
        Authorization: 'Bearer mock-api-key',
        'Custom-Header': 'test-value',
      });
    });
  });
});
