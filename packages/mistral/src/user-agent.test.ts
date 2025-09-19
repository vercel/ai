import { describe, it, expect, vi } from 'vitest';
import { createMistral } from './mistral-provider';

// Only mock the version for consistent testing
vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

describe('user-agent', () => {
  it('should include mistral version in user-agent header for chat model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          object: 'chat.completion',
          created: 1717326371,
          model: 'mistral-tiny',
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

    const provider = createMistral({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    await provider('mistral-tiny').doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });

    expect(mockFetch).toHaveBeenCalled();

    const fetchCallArgs = mockFetch.mock.calls[0];
    const requestInit = fetchCallArgs[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;

    // Verify the user-agent header includes our package version
    expect(headers['user-agent']).toContain('ai-sdk/mistral/0.0.0-test');
  });

  it('should include mistral version in user-agent header for embedding model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          object: 'list',
          data: [
            {
              object: 'embedding',
              embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
              index: 0,
            },
          ],
          model: 'mistral-embed',
          usage: { prompt_tokens: 4, total_tokens: 4 },
        }),
      ),
    );

    const provider = createMistral({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    await provider.textEmbeddingModel('mistral-embed').doEmbed({
      values: ['hello world'],
    });

    expect(mockFetch).toHaveBeenCalled();

    const fetchCallArgs = mockFetch.mock.calls[0];
    const requestInit = fetchCallArgs[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;

    // Verify the user-agent header includes our package version
    expect(headers['user-agent']).toContain('ai-sdk/mistral/0.0.0-test');
  });
});
