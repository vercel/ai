import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiKeyFetchFunction } from './anthropic-aws-fetch';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

describe('createApiKeyFetchFunction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds x-api-key header and merges with existing headers', async () => {
    const dummyFetch = vi.fn().mockResolvedValue(new Response('OK'));
    const fetchFn = createApiKeyFetchFunction(
      'sk-aws-anthropic-123',
      dummyFetch,
    );

    await fetchFn('https://example.com', {
      method: 'POST',
      body: '{"hi":1}',
      headers: { 'content-type': 'application/json' },
    });

    const calledHeaders = dummyFetch.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['x-api-key']).toBe('sk-aws-anthropic-123');
    expect(calledHeaders['content-type']).toBe('application/json');
    expect(calledHeaders['user-agent']).toContain(
      'ai-sdk/anthropic-aws/0.0.0-test',
    );
  });
});
