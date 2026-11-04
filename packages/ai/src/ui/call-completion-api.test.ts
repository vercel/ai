import { describe, expect, it, vi } from 'vitest';
import { callCompletionApi } from './call-completion-api';

describe('callCompletionApi', () => {
  it('should use a fallback message for an empty error body', async () => {
    const setError = vi.fn();

    await callCompletionApi({
      api: '/api/completion',
      prompt: 'hello',
      credentials: undefined,
      headers: undefined,
      body: {},
      streamProtocol: 'text',
      setCompletion: vi.fn(),
      setLoading: vi.fn(),
      setError,
      setAbortController: vi.fn(),
      onFinish: undefined,
      onError: undefined,
      fetch: async () => new Response(null, { status: 502 }),
    });

    expect(setError).toHaveBeenCalledWith(
      new Error('Failed to fetch the chat response.'),
    );
  });
});
