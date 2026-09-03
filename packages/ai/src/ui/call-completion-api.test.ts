import { APICallError, EmptyResponseBodyError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { UIMessageStreamError } from '../error/ui-message-stream-error';
import { callCompletionApi } from './call-completion-api';

describe('callCompletionApi', () => {
  it('should set APICallError for a non-OK response', async () => {
    const setError = vi.fn();
    const onError = vi.fn();

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
      onError,
      fetch: async () => new Response(null, { status: 502 }),
    });

    const error = setError.mock.calls[1][0];
    expect(APICallError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      name: 'AI_APICallError',
      message: 'Failed to fetch the chat response.',
      url: '/api/completion',
      requestBodyValues: undefined,
      statusCode: 502,
      responseBody: '',
      isRetryable: true,
    });
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('should set EmptyResponseBodyError for a response without a body', async () => {
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
      fetch: async () => new Response(null),
    });

    const error = setError.mock.calls[1][0];
    expect(EmptyResponseBodyError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      name: 'AI_EmptyResponseBodyError',
      message: 'The response body is empty.',
    });
  });

  it('should set UIMessageStreamError for an error stream chunk', async () => {
    const setError = vi.fn();

    await callCompletionApi({
      api: '/api/completion',
      prompt: 'hello',
      credentials: undefined,
      headers: undefined,
      body: {},
      streamProtocol: 'data',
      setCompletion: vi.fn(),
      setLoading: vi.fn(),
      setError,
      setAbortController: vi.fn(),
      onFinish: undefined,
      onError: undefined,
      fetch: async () =>
        new Response(
          `data: ${JSON.stringify({
            type: 'error',
            errorText: 'The completion stream failed.',
          })}\n\n`,
        ),
    });

    const error = setError.mock.calls[1][0];
    expect(UIMessageStreamError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      name: 'AI_UIMessageStreamError',
      message: 'The completion stream failed.',
      chunkType: 'error',
      chunkId: '',
    });
  });

  it('should set InvalidArgumentError for an unknown stream protocol', async () => {
    const setError = vi.fn();

    await callCompletionApi({
      api: '/api/completion',
      prompt: 'hello',
      credentials: undefined,
      headers: undefined,
      body: {},
      streamProtocol: 'unknown' as any,
      setCompletion: vi.fn(),
      setLoading: vi.fn(),
      setError,
      setAbortController: vi.fn(),
      onFinish: undefined,
      onError: undefined,
      fetch: async () => new Response('unused'),
    });

    const error = setError.mock.calls[1][0];
    expect(InvalidArgumentError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      name: 'AI_InvalidArgumentError',
      parameter: 'streamProtocol',
      value: 'unknown',
      message:
        'Invalid argument for parameter streamProtocol: Unknown stream protocol: unknown',
    });
  });
});
