import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { LanguageModelV3, NoSuchModelError } from '@ai-sdk/provider';
import { loadApiKey, loadOptionalSetting } from '@ai-sdk/provider-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSarvam } from './sarvam-provider';

const OpenAICompatibleChatLanguageModelMock = vi.mocked(
  OpenAICompatibleChatLanguageModel,
);

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
}));

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
    loadOptionalSetting: vi.fn(),
    withoutTrailingSlash: vi.fn(
      (url: string) => url?.replace(/\/$/, '') ?? url,
    ),
  };
});

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

describe('SarvamProvider', () => {
  const originalEnv = { ...process.env };

  let mockLanguageModel: LanguageModelV3;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SARVAM_API_KEY;
    delete process.env.SARVAM_BASE_URL;

    mockLanguageModel = {} as LanguageModelV3;

    OpenAICompatibleChatLanguageModelMock.mockImplementation(function () {
      return mockLanguageModel as unknown as OpenAICompatibleChatLanguageModel;
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('createSarvam', () => {
    it('should create a SarvamProvider instance with default options', () => {
      const provider = createSarvam();
      provider('sarvam-m');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const modelId = constructorCall[0];
      const config = constructorCall[1];
      const getHeaders = config.headers;

      expect(modelId).toBe('sarvam-m');
      expect(getHeaders).toBeDefined();
      expect(loadApiKey).not.toHaveBeenCalled();

      const headers = getHeaders();
      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'SARVAM_API_KEY',
        description: 'Sarvam',
      });
      expect(headers).toEqual(
        expect.objectContaining({
          'api-subscription-key': 'mock-api-key',
          'user-agent': 'ai-sdk/sarvam/0.0.0-test',
        }),
      );

      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'sarvam-m',
        expect.objectContaining({
          provider: 'sarvam.chat',
          headers: getHeaders,
          includeUsage: true,
          supportsStructuredOutputs: false,
        }),
      );
    });

    it('should create a SarvamProvider instance with custom apiKey', () => {
      createSarvam({ apiKey: 'custom-key' })('sarvam-m');
      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
      const getHeaders = config.headers;

      getHeaders();
      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'SARVAM_API_KEY',
        description: 'Sarvam',
      });
    });

    it('should use default baseURL when no baseURL provided', () => {
      createSarvam()('sarvam-m');

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
      expect(
        config.url({ path: '/chat/completions', modelId: 'sarvam-m' }),
      ).toBe('https://api.sarvam.ai/v1/chat/completions');
      expect(loadOptionalSetting).toHaveBeenCalledWith({
        settingValue: undefined,
        environmentVariableName: 'SARVAM_BASE_URL',
      });
    });

    it('should create a SarvamProvider instance with custom baseURL', () => {
      vi.mocked(loadOptionalSetting).mockReturnValue(
        'https://custom.sarvam.ai/v1',
      );

      const provider = createSarvam({ baseURL: 'https://custom.sarvam.ai/v1' });
      provider('sarvam-m');

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
      expect(
        config.url({ path: '/chat/completions', modelId: 'sarvam-m' }),
      ).toBe('https://custom.sarvam.ai/v1/chat/completions');
    });

    it('should merge custom headers with api-subscription-key', () => {
      createSarvam({
        apiKey: 'test-key',
        headers: { 'X-Custom-Header': 'custom-value' },
      })('sarvam-m');
      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
      const headers = config.headers();

      expect(headers).toEqual(
        expect.objectContaining({
          'api-subscription-key': 'mock-api-key',
          'x-custom-header': 'custom-value',
        }),
      );
    });

    it('should pass custom fetch to OpenAICompatibleChatLanguageModel', () => {
      const customFetch = vi.fn();
      const provider = createSarvam({ fetch: customFetch });
      provider('sarvam-m');

      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'sarvam-m',
        expect.objectContaining({
          fetch: customFetch,
        }),
      );
    });

    it('should return a language model when called as a function', () => {
      const provider = createSarvam();
      const model = provider('sarvam-m');

      expect(model).toBe(mockLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'sarvam-m',
        expect.any(Object),
      );
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct model ID', () => {
      const provider = createSarvam();
      const model = provider.languageModel('sarvam-105b');

      expect(model).toBe(mockLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'sarvam-105b',
        expect.any(Object),
      );
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct model ID', () => {
      const provider = createSarvam();
      const model = provider.chat('sarvam-30b');

      expect(model).toBe(mockLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        'sarvam-30b',
        expect.any(Object),
      );
    });
  });

  describe('unsupported model types', () => {
    it('should throw NoSuchModelError for embeddingModel', () => {
      const provider = createSarvam();

      expect(() => provider.embeddingModel('some-model')).toThrow(
        NoSuchModelError,
      );
    });

    it('should throw NoSuchModelError for imageModel', () => {
      const provider = createSarvam();

      expect(() => provider.imageModel('some-model')).toThrow(NoSuchModelError);
    });
  });

  describe('specificationVersion', () => {
    it('should have specificationVersion v3', () => {
      const provider = createSarvam();

      expect(provider.specificationVersion).toBe('v3');
    });
  });
});
