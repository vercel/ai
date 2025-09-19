import { describe, it, expect, vi } from 'vitest';
import { createVercel } from './vercel-provider';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include vercel version in user-agent header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          object: 'chat.completion',
          model: 'vercel/llama-3.1-8b-instruct',
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
        }),
      ),
    );

    const provider = createVercel({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider('vercel/llama-3.1-8b-instruct');

    const constructorCall = vi.mocked(OpenAICompatibleChatLanguageModel).mock
      .calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/vercel/0.0.0-test');
  });
});
