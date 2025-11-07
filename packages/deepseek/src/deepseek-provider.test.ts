import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createDeepSeek } from './deepseek-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

// Add type assertion for the mocked class
const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
}));

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

describe('DeepSeekProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createDeepSeek', () => {
    it('should create a DeepSeekProvider instance with default options', () => {
      const provider = createDeepSeek();
      const model = provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'DEEPSEEK_API_KEY',
        description: 'DeepSeek API key',
      });
    });

    it('should create a DeepSeekProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createDeepSeek(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'DEEPSEEK_API_KEY',
        description: 'DeepSeek API key',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createDeepSeek();
      const modelId = 'foo-model-id';

      const model = provider(modelId);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });

    it('should include deepseek version in user-agent header', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const provider = createDeepSeek({ fetch: fetchMock });
      provider('model-id');

      const constructorCall = vi.mocked(OpenAICompatibleChatLanguageModel).mock
        .calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      await fetchMock('https://api.deepseek.com/v1/test', {
        method: 'POST',
        headers,
      });

      expect(fetchMock.mock.calls[0][1].headers['user-agent']).toContain(
        'ai-sdk/deepseek/0.0.0-test',
      );
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createDeepSeek();
      const modelId = 'deepseek-chat-model';

      const model = provider.chat(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });
});
