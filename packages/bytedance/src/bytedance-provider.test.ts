import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createByteDance } from './bytedance-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { ByteDanceImageModel } from './bytedance-image-model';
import { ByteDanceVideoModel } from './bytedance-video-model';

const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
}));

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
    withoutTrailingSlash: vi.fn(url => url),
  };
});

describe('ByteDanceProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createByteDance', () => {
    it('should create a ByteDanceProvider instance with default options', () => {
      const provider = createByteDance();
      provider('doubao-seed-2-1-pro-260628');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers!();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'ARK_API_KEY',
        description: 'ByteDance ModelArk',
      });
    });

    it('should create a ByteDanceProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createByteDance(options);
      provider('doubao-seed-2-1-pro-260628');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers!();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'ARK_API_KEY',
        description: 'ByteDance ModelArk',
      });
    });

    it('should pass user-agent header', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const provider = createByteDance({ fetch: fetchMock });
      provider('doubao-seed-2-1-pro-260628');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      const headers = config.headers!();

      await fetchMock(
        'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions',
        {
          method: 'POST',
          headers,
        },
      );

      expect(fetchMock.mock.calls[0][1].headers['user-agent']).toContain(
        'ai-sdk/bytedance/0.0.0-test',
      );
    });

    it('should transform request body options properly', () => {
      const provider = createByteDance();
      provider('doubao-seed-2-1-pro-260628');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];

      const transformed = config.transformRequestBody({
        model: 'doubao-seed-2-1-pro-260628',
        parallelToolCalls: false,
        topLogprobs: 5,
        logitBias: { '42': 1 },
        thinking: { type: 'enabled' },
      });

      expect(transformed).toEqual({
        model: 'doubao-seed-2-1-pro-260628',
        parallel_tool_calls: false,
        top_logprobs: 5,
        logit_bias: { '42': 1 },
        thinking: { type: 'enabled' },
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createByteDance();
      const model = provider('doubao-seed-2-1-pro-260628');
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct configuration', () => {
      const provider = createByteDance();
      const model = provider.languageModel('doubao-seed-2-1-pro-260628');
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createByteDance();
      const model = provider.chat('doubao-seed-2-1-pro-260628');
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('image and imageModel', () => {
    it('should construct image model', () => {
      const provider = createByteDance();
      expect(provider.image('seedream-5-0-260128')).toBeInstanceOf(
        ByteDanceImageModel,
      );
      expect(provider.imageModel('seedream-5-0-260128')).toBeInstanceOf(
        ByteDanceImageModel,
      );
    });
  });

  describe('video and videoModel', () => {
    it('should construct video model', () => {
      const provider = createByteDance();
      expect(provider.video('seedance-2-0-260128')).toBeInstanceOf(
        ByteDanceVideoModel,
      );
      expect(provider.videoModel('seedance-2-0-260128')).toBeInstanceOf(
        ByteDanceVideoModel,
      );
    });
  });

  describe('embeddingModel', () => {
    it('should throw NoSuchModelError when attempting to create embedding model', () => {
      const provider = createByteDance();
      expect(() => provider.embeddingModel('any-model')).toThrow(
        'No such embeddingModel: any-model',
      );
    });
  });
});
