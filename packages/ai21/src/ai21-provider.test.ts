import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createAI21 } from './ai21-provider';
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

describe('AI21Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAI21', () => {
    it('should create an AI21Provider instance with default options', () => {
      const provider = createAI21();
      const model = provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'AI21_API_KEY',
        description: 'AI21 API key',
      });
    });

    it('should create an AI21Provider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createAI21(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'AI21_API_KEY',
        description: 'AI21 API key',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createAI21();
      const modelId = 'foo-model-id';

      const model = provider(modelId);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });

    it('should include ai21 version in user-agent header', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const provider = createAI21({ fetch: fetchMock });
      provider('model-id');

      const constructorCall = vi.mocked(OpenAICompatibleChatLanguageModel).mock
        .calls[0];
      const config = constructorCall[1];
      const headers = config.headers();

      await fetchMock('https://api.ai21.com/studio/v1/test', {
        method: 'POST',
        headers,
      });

      expect(fetchMock.mock.calls[0][1].headers['user-agent']).toContain(
        'ai-sdk/ai21/0.0.0-test',
      );
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createAI21();
      const modelId = 'jamba-large';

      const model = provider.chat(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });
});
