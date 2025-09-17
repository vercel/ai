import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnthropic } from './anthropic-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    getRuntimeEnvironmentUserAgent: vi.fn(() => 'runtime/test-env'),
    withUserAgentSuffix: vi.fn((headers, ...suffixes) => {
      withUserAgentSuffixMock(headers, ...suffixes);
      return { ...headers, 'user-agent': suffixes.join(' ') };
    }),
  };
});

const withUserAgentSuffixMock = vi.fn();

describe('user-agent', () => {
  beforeEach(() => {
    withUserAgentSuffixMock.mockClear();
  });

  it('should include ai-sdk/anthropic/<version> in user-agent header', async () => {
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

    expect(withUserAgentSuffixMock).toHaveBeenCalled();
    const suffixArg = withUserAgentSuffixMock.mock.calls[0][1];

    expect(suffixArg).toBe('ai-sdk/anthropic/0.0.0-test');
  });
});
