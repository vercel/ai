import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createParasail } from './parasail-provider';

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

describe('ParasailProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createParasail', () => {
    it('should create a ParasailProvider instance with default options', () => {
      const provider = createParasail();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers!();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'PARASAIL_API_KEY',
        description: 'Parasail API key',
      });
    });

    it('should create a ParasailProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createParasail(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers!();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'PARASAIL_API_KEY',
        description: 'Parasail API key',
      });
    });

    it('should use the Parasail base URL by default', () => {
      const provider = createParasail();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];

      expect(config.url({ path: '/chat/completions' })).toBe(
        'https://api.parasail.io/v1/chat/completions',
      );
    });

    it('should pass header', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const provider = createParasail({ fetch: fetchMock });
      provider('model-id');

      const constructorCall = vi.mocked(OpenAICompatibleChatLanguageModel).mock
        .calls[0];
      const config = constructorCall[1];
      const headers = config.headers!();

      await fetchMock('https://api.parasail.io/v1/test', {
        method: 'POST',
        headers,
      });

      expect(fetchMock.mock.calls[0][1].headers['user-agent']).toContain(
        'ai-sdk/parasail/0.0.0-test',
      );
    });

    it('should return a chat model when called as a function', () => {
      const provider = createParasail();
      const modelId = 'parasail-deepseek-r1';

      const model = provider(modelId);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct configuration', () => {
      const provider = createParasail();
      const modelId = 'parasail-deepseek-r1';

      const model = provider.languageModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('embeddingModel', () => {
    it('should throw NoSuchModelError when attempting to create embedding model', () => {
      const provider = createParasail();

      expect(() => provider.embeddingModel('any-model')).toThrow(
        'No such embeddingModel: any-model',
      );
    });
  });

  describe('imageModel', () => {
    it('should throw NoSuchModelError when attempting to create image model', () => {
      const provider = createParasail();

      expect(() => provider.imageModel('any-model')).toThrow(
        'No such imageModel: any-model',
      );
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createParasail();
      const modelId = 'parasail-deepseek-r1';

      const model = provider.chat(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });
});
