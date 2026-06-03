import { NoSuchModelError } from '@ai-sdk/provider';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createBaidu } from './baidu-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';

const { BaiduChatLanguageModel } = vi.hoisted(() => ({
  BaiduChatLanguageModel: vi.fn().mockImplementation(function (
    this: any,
    modelId: string,
    settings: any,
  ) {
    this.provider = 'baidu.chat';
    this.modelId = modelId;
    this.settings = settings;
  }),
}));

const BaiduChatLanguageModelMock = BaiduChatLanguageModel as unknown as Mock;

vi.mock('./baidu-chat-language-model', () => {
  return {
    BaiduChatLanguageModel,
  };
});

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');

  return {
    ...actual,
    loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
    withoutTrailingSlash: vi.fn(url => url),
  };
});

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

describe('BaiduProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createBaidu', () => {
    it('should create a BaiduProvider instance with default options', () => {
      const provider = createBaidu();
      provider('ernie-4.5-turbo-128k');

      const constructorCall = BaiduChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'BAIDU_API_KEY',
        description: 'Baidu Qianfan API key',
      });
    });

    it('should create a BaiduProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createBaidu(options);
      provider('ernie-x1-turbo-32k');

      const constructorCall = BaiduChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'BAIDU_API_KEY',
        description: 'Baidu Qianfan API key',
      });
      expect(config.baseURL).toBe('https://custom.url');
      expect(headers).toMatchObject({
        authorization: 'Bearer mock-api-key',
        'custom-header': 'value',
        'user-agent': 'ai-sdk/baidu/0.0.0-test',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createBaidu();

      const model = provider('deepseek-v3.1');

      expect(model).toBeInstanceOf(BaiduChatLanguageModel);
    });

    it('should default includeUsage to true', () => {
      const provider = createBaidu();
      provider('ernie-4.5-turbo-vl-32k');

      const constructorCall = BaiduChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];

      expect(config.includeUsage).toBe(true);
    });

    it('should pass includeUsage option to language model', () => {
      const provider = createBaidu({ includeUsage: false });
      provider('ernie-4.5-turbo-128k');

      const constructorCall = BaiduChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];

      expect(config.includeUsage).toBe(false);
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createBaidu();

      const model = provider.chatModel('ernie-4.5-turbo-128k');

      expect(model).toBeInstanceOf(BaiduChatLanguageModel);
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct configuration', () => {
      const provider = createBaidu();

      const model = provider.languageModel('ernie-x1-turbo-32k');

      expect(model).toBeInstanceOf(BaiduChatLanguageModel);
    });
  });

  describe('embeddingModel', () => {
    it('should throw NoSuchModelError for embedding models', () => {
      const provider = createBaidu();

      expect(() => provider.embeddingModel('embedding-model')).toThrow(
        NoSuchModelError,
      );
    });
  });

  describe('imageModel', () => {
    it('should throw NoSuchModelError for image models', () => {
      const provider = createBaidu();

      expect(() => provider.imageModel('image-model')).toThrow(
        NoSuchModelError,
      );
    });
  });
});
