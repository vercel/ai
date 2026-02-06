import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createAlibaba } from './alibaba-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { AlibabaLanguageModel } from './alibaba-chat-language-model';

const AlibabaLanguageModelMock = AlibabaLanguageModel as unknown as Mock;

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
});
