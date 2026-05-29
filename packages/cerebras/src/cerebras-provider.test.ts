import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createCerebras } from './cerebras-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

// Add type assertion for the mocked class
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

describe('CerebrasProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCerebras', () => {
    it('should create a CerebrasProvider instance with default options', () => {
      const provider = createCerebras();
      const model = provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers!();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'CEREBRAS_API_KEY',
        description: 'Cerebras API key',
      });
    });

    it('should create a CerebrasProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createCerebras(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers!();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'CEREBRAS_API_KEY',
        description: 'Cerebras API key',
      });
    });

    it('should pass header', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('{}', { status: 200 }));

      const provider = createCerebras({ fetch: fetchMock });
      provider('model-id');

      const constructorCall = vi.mocked(OpenAICompatibleChatLanguageModel).mock
        .calls[0];
      const config = constructorCall[1];
      const headers = config.headers!();

      await fetchMock('https://api.cerebras.ai/v1/test', {
        method: 'POST',
        headers,
      });

      expect(fetchMock.mock.calls[0][1].headers['user-agent']).toContain(
        'ai-sdk/cerebras/0.0.0-test',
      );
    });

    it('should return a chat model when called as a function', () => {
      const provider = createCerebras();
      const modelId = 'foo-model-id';

      const model = provider(modelId);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });

    it('should convert assistant reasoning_content to reasoning', () => {
      const provider = createCerebras();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];

      expect(
        config.transformRequestBody({
          model: 'model-id',
          messages: [
            { role: 'user', content: 'what is the magic number?' },
            {
              role: 'assistant',
              content: null,
              reasoning_content: 'I should call a tool.',
              tool_calls: [
                {
                  id: 'tool-call-id',
                  type: 'function',
                  function: { name: 'getNumber', arguments: '{}' },
                },
              ],
            },
            {
              role: 'tool',
              tool_call_id: 'tool-call-id',
              content: '2026',
            },
          ],
        }),
      ).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "what is the magic number?",
              "role": "user",
            },
            {
              "content": null,
              "reasoning": "I should call a tool.",
              "role": "assistant",
              "tool_calls": [
                {
                  "function": {
                    "arguments": "{}",
                    "name": "getNumber",
                  },
                  "id": "tool-call-id",
                  "type": "function",
                },
              ],
            },
            {
              "content": "2026",
              "role": "tool",
              "tool_call_id": "tool-call-id",
            },
          ],
          "model": "model-id",
        }
      `);
    });
  });

  describe('service tier options', () => {
    function getConfig() {
      const provider = createCerebras();
      provider('model-id');
      return OpenAICompatibleChatLanguageModelMock.mock.calls[0][1];
    }

    it('maps serviceTier to service_tier in the request body', () => {
      const config = getConfig();

      const body = config.transformRequestBody({
        model: 'model-id',
        messages: [{ role: 'user', content: 'hi' }],
        serviceTier: 'flex',
      });

      expect(body.service_tier).toBe('flex');
      expect(body).not.toHaveProperty('serviceTier');
    });

    it('strips queueThreshold from the request body', () => {
      const config = getConfig();

      const body = config.transformRequestBody({
        model: 'model-id',
        messages: [{ role: 'user', content: 'hi' }],
        serviceTier: 'auto',
        queueThreshold: 200,
      });

      expect(body.service_tier).toBe('auto');
      expect(body).not.toHaveProperty('queueThreshold');
      expect(body).not.toHaveProperty('queue_threshold');
    });

    it('does not add service_tier when serviceTier is absent', () => {
      const config = getConfig();

      const body = config.transformRequestBody({
        model: 'model-id',
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(body).not.toHaveProperty('service_tier');
    });

    it('wires a metadata extractor that surfaces the effective tier', async () => {
      const config = getConfig();

      expect(config.metadataExtractor).toBeDefined();

      await expect(
        config.metadataExtractor!.extractMetadata({
          parsedBody: { service_tier_used: 'flex' },
        }),
      ).resolves.toEqual({ cerebras: { serviceTier: 'flex' } });

      await expect(
        config.metadataExtractor!.extractMetadata({ parsedBody: {} }),
      ).resolves.toBeUndefined();
    });

    it('builds streamed metadata only when the tier is returned', () => {
      const config = getConfig();

      const withTier = config.metadataExtractor!.createStreamExtractor();
      withTier.processChunk({ choices: [{ delta: { content: 'blue' } }] });
      withTier.processChunk({ service_tier_used: 'flex' });
      expect(withTier.buildMetadata()).toEqual({
        cerebras: { serviceTier: 'flex' },
      });

      const withoutTier = config.metadataExtractor!.createStreamExtractor();
      withoutTier.processChunk({ choices: [{ delta: { content: 'blue' } }] });
      expect(withoutTier.buildMetadata()).toBeUndefined();
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct configuration', () => {
      const provider = createCerebras();
      const modelId = 'foo-model-id';

      const model = provider.languageModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('embeddingModel', () => {
    it('should throw NoSuchModelError when attempting to create embedding model', () => {
      const provider = createCerebras();

      expect(() => provider.embeddingModel('any-model')).toThrow(
        'No such embeddingModel: any-model',
      );
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createCerebras();
      const modelId = 'foo-model-id';

      const model = provider.chat(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });
});
