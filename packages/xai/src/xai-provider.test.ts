import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createXai } from './xai-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { XaiChatLanguageModel } from './xai-chat-language-model';
import { OpenAICompatibleImageModel } from '@ai-sdk/openai-compatible';

const XaiChatLanguageModelMock = XaiChatLanguageModel as unknown as Mock;
const OpenAICompatibleImageModelMock =
  OpenAICompatibleImageModel as unknown as Mock;

vi.mock('./xai-chat-language-model', () => ({
  XaiChatLanguageModel: vi.fn(),
}));

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
  createJsonErrorResponseHandler: vi.fn().mockReturnValue(() => {}),
  generateId: vi.fn().mockReturnValue('mock-id'),
}));

describe('xAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createXAI', () => {
    it('should create an XAIProvider instance with default options', () => {
      const provider = createXai();
      const model = provider('model-id');

      const constructorCall = XaiChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
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

      const constructorCall = XaiChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
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

      const model = provider(modelId);
      expect(model).toBeInstanceOf(XaiChatLanguageModel);
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createXai();
      const modelId = 'xai-chat-model';

      const model = provider.chat(modelId);

      expect(model).toBeInstanceOf(XaiChatLanguageModel);
    });

    it('should pass the includeUsage option to the chat model, to make sure usage is reported while streaming', () => {
      const provider = createXai();
      const modelId = 'xai-chat-model';

      const model = provider.chat(modelId);

      expect(model).toBeInstanceOf(XaiChatLanguageModel);

      const constructorCall = XaiChatLanguageModelMock.mock.calls[0];

      expect(constructorCall[0]).toBe(modelId);
      expect(constructorCall[1].provider).toBe('xai.chat');
      expect(constructorCall[1].baseURL).toBe('https://api.x.ai/v1');
    });
  });

  describe('imageModel', () => {
    it('should construct an image model with correct configuration', () => {
      const provider = createXai();
      const modelId = 'grok-2-image';

      const model = provider.imageModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleImageModel);

      const constructorCall = OpenAICompatibleImageModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe(modelId);

      const config = constructorCall[1];
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
      const config = constructorCall[1];
      expect(config.url({ path: '/test-path' })).toBe(
        `${customBaseURL}/test-path`,
      );
    });

    it('should pass custom headers to image model', () => {
      const customHeaders = { 'Custom-Header': 'test-value' };
      const provider = createXai({ headers: customHeaders });

      provider.imageModel('grok-2-image');

      const constructorCall = OpenAICompatibleImageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(headers).toMatchObject({
        Authorization: 'Bearer mock-api-key',
        'Custom-Header': 'test-value',
      });
    });
  });
});
