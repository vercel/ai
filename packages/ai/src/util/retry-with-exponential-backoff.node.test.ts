import { APICallError } from '@ai-sdk/provider';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { retryWithExponentialBackoffRespectingRetryHeaders } from './retry-with-exponential-backoff';

it('retries marker-recognized APICallErrors across JavaScript realms', async () => {
  vi.useFakeTimers();

  try {
    const ForeignError = runInNewContext(
      '(class ForeignError extends Error {})',
    ) as ErrorConstructor;
    const error = Reflect.construct(
      APICallError,
      [
        {
          message: 'Service unavailable',
          url: 'https://api.example.com',
          requestBodyValues: {},
          statusCode: 503,
          responseHeaders: {
            'retry-after-ms': '1',
          },
        },
      ],
      ForeignError,
    ) as APICallError;
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('success');

    expect(error).not.toBeInstanceOf(Error);
    expect(APICallError.isInstance(error)).toBe(true);
    expect(error.isRetryable).toBe(true);

    const promise = retryWithExponentialBackoffRespectingRetryHeaders()(fn);

    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});
