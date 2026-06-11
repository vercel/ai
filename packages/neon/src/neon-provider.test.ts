import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { loadApiKey, loadSetting } from '@ai-sdk/provider-utils';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { NeonAnthropicLanguageModel } from './neon-anthropic-language-model';
import { NeonChatLanguageModel } from './neon-chat-language-model';
import { NeonResponsesLanguageModel } from './neon-responses-language-model';
import { createNeon } from './neon-provider';

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

// A model id that routes to the unified MLflow endpoint (NeonChatLanguageModel,
// which extends the mocked OpenAICompatibleChatLanguageModel so its config is
// captured by the mock).
const MLFLOW_MODEL = 'databricks-llama-4-maverick';

describe('NeonProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('model routing', () => {
    it('routes Anthropic models to the native Messages model', () => {
      const provider = createNeon();
      expect(provider('databricks-claude-haiku-4-5')).toBeInstanceOf(
        NeonAnthropicLanguageModel,
      );
    });

    it('routes OpenAI (and Codex) models to the native Responses model', () => {
      const provider = createNeon();
      expect(provider('databricks-gpt-5-mini')).toBeInstanceOf(
        NeonResponsesLanguageModel,
      );
      expect(provider('databricks-gpt-5-3-codex')).toBeInstanceOf(
        NeonResponsesLanguageModel,
      );
    });

    it('falls back to the MLflow chat model for Gemini and everything else', () => {
      const provider = createNeon();
      // Gemini routes to MLflow (native Gemini endpoint cannot stream).
      expect(provider('databricks-gemini-2-5-flash')).toBeInstanceOf(
        NeonChatLanguageModel,
      );
      expect(provider('databricks-llama-4-maverick')).toBeInstanceOf(
        NeonChatLanguageModel,
      );
      expect(provider('databricks-qwen35-122b-a10b')).toBeInstanceOf(
        NeonChatLanguageModel,
      );
      expect(provider('databricks-gpt-oss-120b')).toBeInstanceOf(
        NeonChatLanguageModel,
      );
    });
  });

  describe('createNeon (MLflow path config)', () => {
    it('loads the token from the NEON_AI_GATEWAY_TOKEN env var by default', () => {
      const provider = createNeon();
      provider(MLFLOW_MODEL);

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'NEON_AI_GATEWAY_TOKEN',
        description: 'Neon AI Gateway token',
      });
    });

    it('loads the base URL from the NEON_AI_GATEWAY_BASE_URL env var by default', () => {
      const provider = createNeon();
      provider(MLFLOW_MODEL);

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
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
      provider(MLFLOW_MODEL);

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];

      expect(config.url({ path: '/chat/completions' })).toBe(
        'https://br-test-api.ai.c-1.us-east-2.aws.neon.build/ai-gateway/mlflow/v1/chat/completions',
      );
    });

    it('passes custom apiKey to loadApiKey', () => {
      const provider = createNeon({ apiKey: 'custom-token' });
      provider(MLFLOW_MODEL);

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
      config.headers();

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
      provider(MLFLOW_MODEL);

      const config = OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
      const headers = config.headers();

      await fetchMock('https://example.neon.build/test', {
        method: 'POST',
        headers,
      });

      expect(fetchMock.mock.calls[0][1].headers['user-agent']).toContain(
        'ai-sdk/neon/0.0.0-test',
      );
    });
  });

  describe('languageModel / chat', () => {
    it('constructs the routed model via languageModel()', () => {
      const provider = createNeon();
      expect(provider.languageModel(MLFLOW_MODEL)).toBeInstanceOf(
        NeonChatLanguageModel,
      );
    });

    it('constructs the routed model via chat()', () => {
      const provider = createNeon();
      expect(provider.chat('databricks-claude-haiku-4-5')).toBeInstanceOf(
        NeonAnthropicLanguageModel,
      );
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
