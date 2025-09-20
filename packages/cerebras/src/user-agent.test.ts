import { describe, it, expect, vi } from 'vitest';
import { createCerebras } from './cerebras-provider';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('@ai-sdk/openai-compatible', async () => {
  const original = await vi.importActual('@ai-sdk/openai-compatible');
  return {
    ...original,
    OpenAICompatibleChatLanguageModel: vi.fn().mockImplementation(() => ({
      doGenerate: vi.fn(),
    })),
  };
});

describe('user-agent', () => {
  it('should include cerebras version in user-agent header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          object: 'chat.completion',
          created: 1717326371,
          model: 'cerebras-model-id',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Hello, World!',
              },
              finish_reason: 'stop',
              index: 0,
            },
          ],
          usage: {
            prompt_tokens: 4,
            completion_tokens: 3,
            total_tokens: 7,
          },
        }),
      ),
    );

    const provider = createCerebras({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider('cerebras-model-id');

    const constructorCall = vi.mocked(OpenAICompatibleChatLanguageModel).mock
      .calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/cerebras/0.0.0-test');
  });
});
