import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createMoonshot } from './moonshot-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
}));

vi.mock('@ai-sdk/provider-utils', () => ({
  loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
  withoutTrailingSlash: vi.fn(url => url),
}));

describe('MoonshotProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMoonshot', () => {
    it('should create a MoonshotProvider instance with default options', () => {
      const provider = createMoonshot();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];

      expect(constructorCall[0]).toBe('model-id');
      expect(config.provider).toBe('moonshot.chat');
      expect(config.url({ path: '/chat/completions' })).toBe(
        'https://api.moonshot.ai/v1/chat/completions',
      );

      const headers = config.headers();
      expect(headers).toMatchInlineSnapshot(`
        {
          "Authorization": "Bearer mock-api-key",
        }
      `);

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'MOONSHOT_API_KEY',
        description: 'Moonshot API key',
      });
    });

    it('should create a MoonshotProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createMoonshot(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];

      expect(constructorCall[0]).toBe('model-id');
      expect(config.provider).toBe('moonshot.chat');
      expect(config.url({ path: '/chat/completions' })).toBe(
        'https://custom.url/chat/completions',
      );

      const headers = config.headers();
      expect(headers).toMatchInlineSnapshot(`
        {
          "Authorization": "Bearer mock-api-key",
          "Custom-Header": "value",
        }
      `);

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'MOONSHOT_API_KEY',
        description: 'Moonshot API key',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createMoonshot();
      const modelId = 'kimi-k2-0711-preview';

      const model = provider(modelId);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct configuration', () => {
      const provider = createMoonshot();
      const modelId = 'kimi-k2-0711-preview';

      const model = provider.languageModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'moonshot.chat',
        }),
      );
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createMoonshot();
      const modelId = 'kimi-k2-0711-preview';

      const model = provider.chat(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'moonshot.chat',
        }),
      );
    });
  });

  describe('textEmbeddingModel', () => {
    it('should throw NoSuchModelError when attempting to create embedding model', () => {
      const provider = createMoonshot();

      expect(() => provider.textEmbeddingModel('any-model')).toThrow(
        'No such textEmbeddingModel: any-model',
      );
    });
  });

  describe('imageModel', () => {
    it('should throw NoSuchModelError when attempting to create image model', () => {
      const provider = createMoonshot();

      expect(() => provider.imageModel('any-model')).toThrow(
        'No such imageModel: any-model',
      );
    });
  });
});
