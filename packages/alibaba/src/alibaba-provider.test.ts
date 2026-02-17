import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createAlibaba } from './alibaba-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { AlibabaLanguageModel } from './alibaba-chat-language-model';
import { AlibabaVideoModel } from './alibaba-video-model';

const AlibabaLanguageModelMock = AlibabaLanguageModel as unknown as Mock;
const AlibabaVideoModelMock = AlibabaVideoModel as unknown as Mock;

vi.mock('./alibaba-chat-language-model', () => {
  const mockConstructor = vi.fn().mockImplementation(function (
    this: any,
    modelId: string,
    settings: any,
  ) {
    this.provider = 'alibaba.chat';
    this.modelId = modelId;
    this.settings = settings;
  });
  return {
    AlibabaLanguageModel: mockConstructor,
  };
});

vi.mock('./alibaba-video-model', () => {
  const mockConstructor = vi.fn().mockImplementation(function (
    this: any,
    modelId: string,
    settings: any,
  ) {
    this.provider = 'alibaba.video';
    this.modelId = modelId;
    this.settings = settings;
  });
  return {
    AlibabaVideoModel: mockConstructor,
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

describe('AlibabaProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAlibaba', () => {
    it('should create an AlibabaProvider instance with default options', () => {
      const provider = createAlibaba();
      const model = provider('qwen-plus');

      const constructorCall = AlibabaLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'ALIBABA_API_KEY',
        description: 'Alibaba Cloud (DashScope)',
      });
    });

    it('should create an AlibabaProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createAlibaba(options);
      const model = provider('qwen-plus');

      const constructorCall = AlibabaLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'ALIBABA_API_KEY',
        description: 'Alibaba Cloud (DashScope)',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createAlibaba();
      const modelId = 'qwen3-max';

      const model = provider(modelId);
      expect(model).toBeInstanceOf(AlibabaLanguageModel);
    });

    it('should pass includeUsage option to language model', () => {
      const provider = createAlibaba({ includeUsage: false });
      provider('qwen-plus');

      const constructorCall = AlibabaLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];

      expect(config.includeUsage).toBe(false);
    });

    it('should default includeUsage to true', () => {
      const provider = createAlibaba();
      provider('qwen-plus');

      const constructorCall = AlibabaLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];

      expect(config.includeUsage).toBe(true);
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createAlibaba();
      const modelId = 'qwen-turbo';

      const model = provider.chatModel(modelId);

      expect(model).toBeInstanceOf(AlibabaLanguageModel);
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct configuration', () => {
      const provider = createAlibaba();
      const modelId = 'qwen3-max';

      const model = provider.languageModel(modelId);

      expect(model).toBeInstanceOf(AlibabaLanguageModel);
    });
  });

  describe('video', () => {
    it('should construct a video model with correct provider', () => {
      const provider = createAlibaba();
      const model = provider.video('wan2.6-t2v');

      expect(model).toBeInstanceOf(AlibabaVideoModel);
      const constructorCall = AlibabaVideoModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe('wan2.6-t2v');
      expect(constructorCall[1].provider).toBe('alibaba.video');
    });

    it('should use default videoBaseURL', () => {
      const provider = createAlibaba();
      provider.video('wan2.6-t2v');

      const constructorCall = AlibabaVideoModelMock.mock.calls[0];
      expect(constructorCall[1].baseURL).toBe(
        'https://dashscope-intl.aliyuncs.com',
      );
    });

    it('should use custom videoBaseURL', () => {
      const provider = createAlibaba({
        videoBaseURL: 'https://dashscope.aliyuncs.com',
      });
      provider.video('wan2.6-t2v');

      const constructorCall = AlibabaVideoModelMock.mock.calls[0];
      expect(constructorCall[1].baseURL).toBe('https://dashscope.aliyuncs.com');
    });

    it('should pass custom fetch to video model', () => {
      const customFetch = vi.fn();
      const provider = createAlibaba({ fetch: customFetch });
      provider.video('wan2.6-t2v');

      const constructorCall = AlibabaVideoModelMock.mock.calls[0];
      expect(constructorCall[1].fetch).toBe(customFetch);
    });

    it('should pass headers function to video model', () => {
      const provider = createAlibaba({
        apiKey: 'test-key',
        headers: { 'X-Custom': 'value' },
      });
      provider.video('wan2.6-t2v');

      const constructorCall = AlibabaVideoModelMock.mock.calls[0];
      const headers = constructorCall[1].headers();

      expect(headers).toMatchObject({
        authorization: 'Bearer mock-api-key',
        'x-custom': 'value',
      });
    });
  });

  describe('videoModel', () => {
    it('should construct a video model with correct configuration', () => {
      const provider = createAlibaba();
      const model = provider.videoModel('wan2.6-i2v-flash');

      expect(model).toBeInstanceOf(AlibabaVideoModel);
      const constructorCall = AlibabaVideoModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe('wan2.6-i2v-flash');
      expect(constructorCall[1].provider).toBe('alibaba.video');
    });

    it('should use the same videoBaseURL as video()', () => {
      const provider = createAlibaba({
        videoBaseURL: 'https://custom-video.example.com',
      });
      provider.videoModel('wan2.6-r2v');

      const constructorCall = AlibabaVideoModelMock.mock.calls[0];
      expect(constructorCall[1].baseURL).toBe(
        'https://custom-video.example.com',
      );
    });
  });
});
