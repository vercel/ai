import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createNeon } from './neon-provider';
import { loadApiKey, loadSetting } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

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
    loadApiKey: vi.fn().mockReturnValue('mock-token'),
    loadSetting: vi
      .fn()
      .mockReturnValue('https://br-test-api.ai.c-1.us-east-2.aws.neon.build'),
    withoutTrailingSlash: vi.fn(url => url),
  };
});

describe('NeonProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createNeon', () => {
    it('loads the token from the NEON_AI_GATEWAY_TOKEN env var by default', () => {
      const provider = createNeon();
      provider('databricks-claude-haiku-4-5');

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
      config.headers!();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'NEON_AI_GATEWAY_TOKEN',
        description: 'Neon AI Gateway token',
      });
    });

    it('loads the base URL from the NEON_AI_GATEWAY_BASE_URL env var by default', () => {
      const provider = createNeon();
      provider('databricks-claude-haiku-4-5');

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
      // base URL is resolved lazily when a request URL is built
      config.url({ path: '/chat/completions' });

      expect(loadSetting).toHaveBeenCalledWith({
        settingValue: undefined,
        environmentVariableName: 'NEON_AI_GATEWAY_BASE_URL',
        settingName: 'baseURL',
        description: 'Neon AI Gateway base URL',
      });
    });

    it('appends the unified mlflow path to the configured host root', () => {
      const provider = createNeon({
        baseURL: 'https://br-test-api.ai.c-1.us-east-2.aws.neon.build',
      });
      provider('databricks-claude-haiku-4-5');

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];

      expect(config.url({ path: '/chat/completions' })).toBe(
        'https://br-test-api.ai.c-1.us-east-2.aws.neon.build/ai-gateway/mlflow/v1/chat/completions',
      );
    });

    it('passes custom apiKey to loadApiKey', () => {
      const provider = createNeon({ apiKey: 'custom-token' });
      provider('databricks-claude-haiku-4-5');

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
      config.headers!();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-token',
        environmentVariableName: 'NEON_AI_GATEWAY_TOKEN',
        description: 'Neon AI Gateway token',
      });
    });

    it('adds the Neon user-agent suffix to request headers', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const provider = createNeon({ fetch: fetchMock });
      provider('databricks-claude-haiku-4-5');

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
      const headers = config.headers!();

      await fetchMock('https://example.neon.build/test', {
        method: 'POST',
        headers,
      });

      expect(fetchMock.mock.calls[0][1].headers['user-agent']).toContain(
        'ai-sdk/neon/0.0.0-test',
      );
    });

    it('returns a chat model when called as a function', () => {
      const provider = createNeon();
      const model = provider('databricks-claude-haiku-4-5');
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('languageModel', () => {
    it('constructs a chat language model', () => {
      const provider = createNeon();
      const model = provider.languageModel('databricks-claude-haiku-4-5');
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('chat', () => {
    it('constructs a chat model', () => {
      const provider = createNeon();
      const model = provider.chat('databricks-claude-haiku-4-5');
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('embeddingModel', () => {
    it('throws NoSuchModelError', () => {
      const provider = createNeon();
      expect(() => provider.embeddingModel('any-model')).toThrow(
        'No such embeddingModel: any-model',
      );
    });
  });

  describe('imageModel', () => {
    it('throws NoSuchModelError', () => {
      const provider = createNeon();
      expect(() => provider.imageModel('any-model')).toThrow(
        'No such imageModel: any-model',
      );
    });
  });
});
