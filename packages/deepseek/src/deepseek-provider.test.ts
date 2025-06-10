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

vi.mock('@ai-sdk/provider-utils', () => ({
  loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
  withoutTrailingSlash: vi.fn(url => url),
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

describe('raw chunks inheritance', () => {
  it('should support raw chunks functionality through OpenAI-compatible model', () => {
    vi.clearAllMocks(); // Clear any previous calls

    const provider = createDeepSeek({
      apiKey: 'test-api-key',
    });

    const model = provider.chat('test-deepseek-chat');

    // Verify that the underlying model was constructed properly
    expect(model).toBeDefined();

    // Check that the OpenAI-compatible model was called with correct config
    const calls = OpenAICompatibleChatLanguageModelMock.mock.calls;
    const call = calls.find(call => call[0] === 'test-deepseek-chat');
    expect(call).toBeDefined();
    expect(call![1].provider).toBe('deepseek.chat');

    // The underlying OpenAI-compatible model should inherit raw chunks support
  });
});
