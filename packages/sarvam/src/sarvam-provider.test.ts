import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { LanguageModelV3, NoSuchModelError } from '@ai-sdk/provider';
import { loadApiKey, loadOptionalSetting } from '@ai-sdk/provider-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSarvam } from './sarvam-provider';

const createOpenAICompatibleMock = vi.mocked(createOpenAICompatible);

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(),
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
  let mockOpenAICompatibleProvider: {
    languageModel: ReturnType<typeof vi.fn>;
    chatModel: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SARVAM_API_KEY;
    delete process.env.SARVAM_BASE_URL;

    mockLanguageModel = {} as LanguageModelV3;

    mockOpenAICompatibleProvider = {
      languageModel: vi.fn().mockReturnValue(mockLanguageModel),
      chatModel: vi.fn().mockReturnValue(mockLanguageModel),
    };

    createOpenAICompatibleMock.mockReturnValue(
      mockOpenAICompatibleProvider as unknown as ReturnType<
        typeof createOpenAICompatible
      >,
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('createSarvam', () => {
    it('should create a SarvamProvider instance with default options', () => {
      const provider = createSarvam();
      provider('sarvam-m');

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'SARVAM_API_KEY',
        description: 'Sarvam',
      });

      expect(createOpenAICompatibleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.sarvam.ai/v1',
          name: 'sarvam',
          headers: expect.objectContaining({
            'api-subscription-key': 'mock-api-key',
          }),
          includeUsage: true,
          supportsStructuredOutputs: false,
        }),
      );
    });

    it('should create a SarvamProvider instance with custom apiKey', () => {
      const provider = createSarvam({ apiKey: 'custom-key' });
      provider('sarvam-m');

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'SARVAM_API_KEY',
        description: 'Sarvam',
      });

      expect(createOpenAICompatibleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'api-subscription-key': 'mock-api-key',
          }),
        }),
      );
    });

    it('should create a SarvamProvider instance with custom baseURL', () => {
      vi.mocked(loadOptionalSetting).mockReturnValue(
        'https://custom.sarvam.ai/v1',
      );

      const provider = createSarvam({ baseURL: 'https://custom.sarvam.ai/v1' });
      provider('sarvam-m');

      expect(createOpenAICompatibleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://custom.sarvam.ai/v1',
        }),
      );
    });

    it('should merge custom headers with api-subscription-key', () => {
      const provider = createSarvam({
        apiKey: 'test-key',
        headers: { 'X-Custom-Header': 'custom-value' },
      });
      provider('sarvam-m');

      expect(createOpenAICompatibleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'api-subscription-key': 'mock-api-key',
            'X-Custom-Header': 'custom-value',
          }),
        }),
      );
    });

    it('should pass custom fetch to createOpenAICompatible', () => {
      const customFetch = vi.fn();
      const provider = createSarvam({ fetch: customFetch });
      provider('sarvam-m');

      expect(createOpenAICompatibleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fetch: customFetch,
        }),
      );
    });

    it('should return a language model when called as a function', () => {
      const provider = createSarvam();
      const model = provider('sarvam-m');

      expect(model).toBe(mockLanguageModel);
      expect(mockOpenAICompatibleProvider.languageModel).toHaveBeenCalledWith(
        'sarvam-m',
      );
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct model ID', () => {
      const provider = createSarvam();
      const model = provider.languageModel('sarvam-105b');

      expect(model).toBe(mockLanguageModel);
      expect(mockOpenAICompatibleProvider.languageModel).toHaveBeenCalledWith(
        'sarvam-105b',
      );
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct model ID', () => {
      const provider = createSarvam();
      const model = provider.chat('sarvam-30b');

      expect(model).toBe(mockLanguageModel);
      expect(mockOpenAICompatibleProvider.chatModel).toHaveBeenCalledWith(
        'sarvam-30b',
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
