import { describe, it, expect, vi } from 'vitest';
import { createAzure } from './azure-openai-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

// Mock the OpenAI models that Azure uses
const createMockModel = (config: any) => ({
  doGenerate: vi.fn().mockImplementation(async () => {
    if (config?.fetch) {
      await config.fetch('https://test-url', {
        headers: await config.headers(),
      });
    }
    return {
      content: [{ type: 'text', text: 'response' }],
      finishReason: 'stop',
      usage: {},
      warnings: [],
    };
  }),
});

vi.mock('@ai-sdk/openai/internal', () => ({
  OpenAIChatLanguageModel: vi
    .fn()
    .mockImplementation((modelId, config) => createMockModel(config)),
  OpenAICompletionLanguageModel: vi
    .fn()
    .mockImplementation((modelId, config) => createMockModel(config)),
  OpenAIEmbeddingModel: vi
    .fn()
    .mockImplementation((modelId, config) => createMockModel(config)),
  OpenAIImageModel: vi
    .fn()
    .mockImplementation((modelId, config) => createMockModel(config)),
  OpenAIResponsesLanguageModel: vi
    .fn()
    .mockImplementation((modelId, config) => createMockModel(config)),
  OpenAISpeechModel: vi
    .fn()
    .mockImplementation((modelId, config) => createMockModel(config)),
  OpenAITranscriptionModel: vi
    .fn()
    .mockImplementation((modelId, config) => createMockModel(config)),
}));

describe('user-agent', () => {
  it('should include azure version in user-agent header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd',
          object: 'chat.completion',
          created: 1711115037,
          model: 'gpt-3.5-turbo-0125',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello!',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 4,
            total_tokens: 34,
            completion_tokens: 30,
          },
          system_fingerprint: 'fp_3bc1b5746c',
        }),
      ),
    );

    const provider = createAzure({
      resourceName: 'test-resource',
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    await provider('test-deployment').doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });

    expect(mockFetch).toHaveBeenCalled();

    const fetchCallArgs = mockFetch.mock.calls[0];
    const requestInit = fetchCallArgs[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;

    expect(headers['user-agent']).toContain('ai-sdk/azure/0.0.0-test');
  });

  it('should include user-agent header for all model types', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'cmpl-96cAM1v77r4jXa4qb2NSmRREV5oWB',
          object: 'text_completion',
          created: 1711363706,
          model: 'gpt-35-turbo-instruct',
          choices: [
            {
              text: 'Hello World!',
              index: 0,
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 4,
            total_tokens: 34,
            completion_tokens: 30,
          },
        }),
      ),
    );

    const provider = createAzure({
      resourceName: 'test-resource',
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    // Test completion model
    await provider.completion('gpt-35-turbo-instruct').doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });

    expect(mockFetch).toHaveBeenCalled();

    const fetchCallArgs = mockFetch.mock.calls[0];
    const requestInit = fetchCallArgs[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;

    expect(headers['user-agent']).toStrictEqual('ai-sdk/azure/0.0.0-test');
  });
});
