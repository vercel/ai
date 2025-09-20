import { describe, it, expect, vi } from 'vitest';
import { createCohere } from './cohere-provider';

// Only mock the version for consistent testing
vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

describe('user-agent', () => {
  it('should include cohere version in user-agent header for chat model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          response_id: '0cf61ae0-1f60-4c18-9802-be7be809e712',
          generation_id: 'dad0c7cd-7982-42a7-acfb-706ccf598291',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello, World!' }],
          },
          finish_reason: 'COMPLETE',
          usage: {
            billed_units: { input_tokens: 9, output_tokens: 415 },
            tokens: { input_tokens: 4, output_tokens: 30 },
          },
        }),
      ),
    );

    const provider = createCohere({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    await provider('command-r-plus').doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });

    expect(mockFetch).toHaveBeenCalled();

    const fetchCallArgs = mockFetch.mock.calls[0];
    const requestInit = fetchCallArgs[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;

    // Verify the user-agent header includes our package version
    expect(headers['user-agent']).toContain('ai-sdk/cohere/0.0.0-test');
  });

  it('should include cohere version in user-agent header for embedding model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          texts: ['sunny day at the beach'],
          embeddings: { float: [[0.1, 0.2, 0.3, 0.4, 0.5]] },
          meta: { billed_units: { input_tokens: 8 } },
        }),
      ),
    );

    const provider = createCohere({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    await provider.textEmbeddingModel('embed-english-v3.0').doEmbed({
      values: ['sunny day at the beach'],
    });

    expect(mockFetch).toHaveBeenCalled();

    const fetchCallArgs = mockFetch.mock.calls[0];
    const requestInit = fetchCallArgs[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;

    // Verify the user-agent header includes our package version
    expect(headers['user-agent']).toContain('ai-sdk/cohere/0.0.0-test');
  });
});
