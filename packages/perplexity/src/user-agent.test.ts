import { describe, it, expect, vi } from 'vitest';
import { createPerplexity } from './perplexity-provider';
import { PerplexityLanguageModel } from './perplexity-language-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('./perplexity-language-model', () => ({
  PerplexityLanguageModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include perplexity version in user-agent header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          object: 'chat.completion',
          model: 'llama-3.1-sonar-small-128k-online',
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

    const provider = createPerplexity({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider('llama-3.1-sonar-small-128k-online');

    const constructorCall = vi.mocked(PerplexityLanguageModel).mock.calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/perplexity/0.0.0-test');
  });
});
