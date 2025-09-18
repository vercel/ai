import { describe, it, expect, vi } from 'vitest';
import { createAnthropic } from './anthropic-provider';

// Only mock the version for consistent testing
vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

describe('user-agent', () => {
  it('should include anthropic version in user-agent header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-3-opus-20240229',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      ),
    );

    const provider = createAnthropic({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    await provider.messages('claude-3-opus-20240229').doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });

    expect(mockFetch).toHaveBeenCalled();
    
    const fetchCallArgs = mockFetch.mock.calls[0];
    const requestInit = fetchCallArgs[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;
    
    // Verify the user-agent header includes our package version
    expect(headers['user-agent']).toContain('ai-sdk/anthropic/0.0.0-test');
  });
});
