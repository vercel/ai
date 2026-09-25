import { APICallError, EmptyResponseBodyError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { UIMessageStreamError } from '../error/ui-message-stream-error';
import { callCompletionApi } from './call-completion-api';

describe('callCompletionApi', () => {
  it.each(['abort', 'success', 'error'] as const)(
    'should clear the current request after %s',
    async outcome => {
      let controller: AbortController | null = null;
      const setLoading = vi.fn();
      const setError = vi.fn();
      const onFinish = vi.fn();
      const onError = vi.fn();
      const error = new Error('Request failed');
      const result = await callCompletionApi({
        api: '/api/completion',
        prompt: 'hello',
        credentials: undefined,
        headers: undefined,
        body: {},
        streamProtocol: 'text',
        setCompletion: vi.fn(),
        setLoading,
        setError,
        setAbortController: value => {
          controller = value;
        },
        getAbortController: () => controller,
        onFinish,
        onError,
        fetch: async () => {
          if (outcome === 'abort') {
            controller!.abort();
            throw new DOMException('Aborted', 'AbortError');
          }
          if (outcome === 'error') {
            throw error;
          }
          return new Response('hello world');
        },
      });

      expect(controller).toBeNull();
      expect(setLoading.mock.calls).toEqual([[true], [false]]);
      if (outcome === 'success') {
        expect(result).toBe('hello world');
        expect(onFinish).toHaveBeenCalledWith('hello', 'hello world');
      } else if (outcome === 'abort') {
        expect(result).toBeNull();
        expect(onError).not.toHaveBeenCalled();
      } else {
        expect(setError).toHaveBeenLastCalledWith(error);
        expect(onError).toHaveBeenCalledWith(error);
      }
    },
  );

  describe.each(['text', 'data'] as const)(
    '%s request state',
    streamProtocol => {
      it.each(['abort', 'success', 'error'] as const)(
        'should preserve a newer request when the previous request ends with %s',
        async outcome => {
          let controller: AbortController | null = null;
          const setLoading = vi.fn();
          const setCompletion = vi.fn();
          const setError = vi.fn();
          const onError = vi.fn();
          let resolveFirst!: (response: Response) => void;
          let rejectFirst!: (error: Error) => void;
          const firstResponse = new Promise<Response>((resolve, reject) => {
            resolveFirst = resolve;
            rejectFirst = reject;
          });
          const options = {
            api: '/api/completion',
            credentials: undefined,
            headers: undefined,
            body: {},
            streamProtocol,
            setCompletion,
            setLoading,
            setError,
            setAbortController: (value: AbortController | null) => {
              controller = value;
            },
            getAbortController: (): AbortController | null => controller,
            onFinish: undefined,
            onError,
          };

          const first = callCompletionApi({
            ...options,
            prompt: 'first',
            fetch: () => firstResponse,
          });
          if (outcome === 'abort') {
            options.getAbortController()!.abort();
            rejectFirst(new DOMException('Aborted', 'AbortError'));
          }

          const second = callCompletionApi({
            ...options,
            prompt: 'second',
            fetch: (_url, init) =>
              new Promise((_resolve, reject) => {
                init!.signal!.addEventListener('abort', () => {
                  reject(new DOMException('Aborted', 'AbortError'));
                });
              }),
          });
          const secondController = options.getAbortController()!;

          if (outcome === 'success') {
            resolveFirst(
              new Response(
                streamProtocol === 'text'
                  ? 'first completion'
                  : 'data: {"type":"text-delta","id":"0","delta":"first completion"}\n\n',
              ),
            );
          } else if (outcome === 'error') {
            rejectFirst(new Error('First request failed'));
          }
          await first;

          expect(controller).toBe(secondController);
          expect(setLoading).toHaveBeenLastCalledWith(true);
          expect(setCompletion).toHaveBeenLastCalledWith('');
          expect(setError).toHaveBeenLastCalledWith(undefined);

          // The replacement request must still be cancellable after the old one settles.
          options.getAbortController()!.abort();
          expect(secondController.signal.aborted).toBe(true);
          await expect(second).resolves.toBeNull();
          expect(controller).toBeNull();
          expect(setLoading).toHaveBeenLastCalledWith(false);
        },
      );
    },
  );

  it.each(['onFinish', 'onError'] as const)(
    'should preserve a request started from %s',
    async callback => {
      let controller: AbortController | null = null;
      const setLoading = vi.fn();
      const setError = vi.fn();
      let second!: ReturnType<typeof callCompletionApi>;
      const options = {
        api: '/api/completion',
        prompt: 'first',
        credentials: undefined,
        headers: undefined,
        body: {},
        streamProtocol: 'text' as const,
        setCompletion: vi.fn(),
        setLoading,
        setError,
        setAbortController: (value: AbortController | null) => {
          controller = value;
        },
        getAbortController: (): AbortController | null => controller,
        onFinish: undefined,
        onError: undefined,
      };
      const startSecond = () => {
        second = callCompletionApi({
          ...options,
          prompt: 'second',
          fetch: (_url, init) =>
            new Promise((_resolve, reject) => {
              init!.signal!.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }),
        });
      };

      await callCompletionApi({
        ...options,
        [callback]: startSecond,
        fetch: async () => {
          if (callback === 'onError') {
            throw new Error('First request failed');
          }
          return new Response('first completion');
        },
      });

      expect(setLoading).toHaveBeenLastCalledWith(true);
      expect(setError).toHaveBeenLastCalledWith(undefined);
      expect(options.getAbortController()).not.toBeNull();
      options.getAbortController()!.abort();
      await expect(second).resolves.toBeNull();
      expect(controller).toBeNull();
      expect(setLoading).toHaveBeenLastCalledWith(false);
    },
  );

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
