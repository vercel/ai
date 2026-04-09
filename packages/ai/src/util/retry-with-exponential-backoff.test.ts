import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { APICallError } from '@ai-sdk/provider';
import {
  GatewayInternalServerError,
  GatewayRateLimitError,
  GatewayAuthenticationError,
  GatewayInvalidRequestError,
} from '@ai-sdk/gateway';
import { retryWithExponentialBackoffRespectingRetryHeaders } from './retry-with-exponential-backoff';

describe('retryWithExponentialBackoffRespectingRetryHeaders', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should use rate limit header delay when present and reasonable', async () => {
    let attempt = 0;
    const retryAfterMs = 3000;

    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt === 1) {
        throw new APICallError({
          message: 'Rate limited',
          url: 'https://api.example.com',
          requestBodyValues: {},
          isRetryable: true,
          data: undefined,
          responseHeaders: {
            'retry-after-ms': retryAfterMs.toString(),
          },
        });
      }
      return 'success';
    });

    const promise = retryWithExponentialBackoffRespectingRetryHeaders()(fn);

    // Should use rate limit delay (3000ms)
    await vi.advanceTimersByTimeAsync(retryAfterMs - 100);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result).toBe('success');
  });

  it('should parse retry-after header in seconds', async () => {
    let attempt = 0;
    const retryAfterSeconds = 5;

    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt === 1) {
        throw new APICallError({
          message: 'Rate limited',
          url: 'https://api.example.com',
          requestBodyValues: {},
          isRetryable: true,
          data: undefined,
          responseHeaders: {
            'retry-after': retryAfterSeconds.toString(),
          },
        });
      }
      return 'success';
    });

    const promise = retryWithExponentialBackoffRespectingRetryHeaders()(fn);

    // Fast-forward to just before the retry delay
    await vi.advanceTimersByTimeAsync(retryAfterSeconds * 1000 - 100);
    expect(fn).toHaveBeenCalledTimes(1);

    // Fast-forward past the retry delay
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result).toBe('success');
  });

  it('should use exponential backoff when rate limit delay is too long', async () => {
    let attempt = 0;
    const retryAfterMs = 70000; // 70 seconds - too long
    const initialDelay = 2000; // Default exponential backoff

    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt === 1) {
        throw new APICallError({
          message: 'Rate limited',
          url: 'https://api.example.com',
          requestBodyValues: {},
          isRetryable: true,
          data: undefined,
          responseHeaders: {
            'retry-after-ms': retryAfterMs.toString(),
          },
        });
      }
      return 'success';
    });

    const promise = retryWithExponentialBackoffRespectingRetryHeaders({
      initialDelayInMs: initialDelay,
    })(fn);

    // Should use exponential backoff delay (2000ms) not the rate limit (70000ms)
    await vi.advanceTimersByTimeAsync(initialDelay - 100);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result).toBe('success');
  });

  it('should fall back to exponential backoff when no rate limit headers', async () => {
    let attempt = 0;
    const initialDelay = 2000;

    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt === 1) {
        throw new APICallError({
          message: 'Temporary error',
          url: 'https://api.example.com',
          requestBodyValues: {},
          isRetryable: true,
          data: undefined,
          responseHeaders: {},
        });
      }
      return 'success';
    });

    const promise = retryWithExponentialBackoffRespectingRetryHeaders({
      initialDelayInMs: initialDelay,
    })(fn);

    // Fast-forward to just before the initial delay
    await vi.advanceTimersByTimeAsync(initialDelay - 100);
    expect(fn).toHaveBeenCalledTimes(1);

    // Fast-forward past the initial delay
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result).toBe('success');
  });

  it('should handle invalid rate limit header values', async () => {
    let attempt = 0;
    const initialDelay = 2000;

    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt === 1) {
        throw new APICallError({
          message: 'Rate limited',
          url: 'https://api.example.com',
          requestBodyValues: {},
          isRetryable: true,
          data: undefined,
          responseHeaders: {
            'retry-after-ms': 'invalid',
            'retry-after': 'not-a-number',
          },
        });
      }
      return 'success';
    });

    const promise = retryWithExponentialBackoffRespectingRetryHeaders({
      initialDelayInMs: initialDelay,
    })(fn);

    // Should fall back to exponential backoff delay
    await vi.advanceTimersByTimeAsync(initialDelay - 100);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result).toBe('success');
  });

  describe('with mocked provider responses', () => {
    it('should handle Anthropic 429 response with retry-after-ms header', async () => {
      let attempt = 0;
      const delayMs = 5000;

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          // Simulate actual Anthropic 429 response with retry-after-ms
          throw new APICallError({
            message: 'Rate limit exceeded',
            url: 'https://api.anthropic.com/v1/messages',
            requestBodyValues: {},
            statusCode: 429,
            isRetryable: true,
            data: {
              error: {
                type: 'rate_limit_error',
                message: 'Rate limit exceeded',
              },
            },
            responseHeaders: {
              'retry-after-ms': delayMs.toString(),
              'x-request-id': 'req_123456',
            },
          });
        }
        return { content: 'Hello from Claude!' };
      });

      const promise = retryWithExponentialBackoffRespectingRetryHeaders()(fn);

      // Should use the delay from retry-after-ms header
      await vi.advanceTimersByTimeAsync(delayMs - 100);
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toEqual({ content: 'Hello from Claude!' });
    });

    it('should handle OpenAI 429 response with retry-after header', async () => {
      let attempt = 0;
      const delaySeconds = 30; // 30 seconds

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          // Simulate actual OpenAI 429 response with retry-after
          throw new APICallError({
            message: 'Rate limit reached for requests',
            url: 'https://api.openai.com/v1/chat/completions',
            requestBodyValues: {},
            statusCode: 429,
            isRetryable: true,
            data: {
              error: {
                message: 'Rate limit reached for requests',
                type: 'requests',
                param: null,
                code: 'rate_limit_exceeded',
              },
            },
            responseHeaders: {
              'retry-after': delaySeconds.toString(),
              'x-request-id': 'req_abcdef123456',
            },
          });
        }
        return { choices: [{ message: { content: 'Hello from GPT!' } }] };
      });

      const promise = retryWithExponentialBackoffRespectingRetryHeaders()(fn);

      // Should use the delay from retry-after header (30 seconds)
      await vi.advanceTimersByTimeAsync(delaySeconds * 1000 - 100);
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toEqual({
        choices: [{ message: { content: 'Hello from GPT!' } }],
      });
    });

    it('should handle multiple retries with exponential backoff progression', async () => {
      let attempt = 0;
      const baseTime = 1700000000000;

      vi.setSystemTime(baseTime);

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          // First attempt: 5 second rate limit delay
          throw new APICallError({
            message: 'Rate limited',
            url: 'https://api.anthropic.com/v1/messages',
            requestBodyValues: {},
            statusCode: 429,
            isRetryable: true,
            data: undefined,
            responseHeaders: {
              'retry-after-ms': '5000',
            },
          });
        } else if (attempt === 2) {
          // Second attempt: 2 second rate limit delay, but exponential backoff is 4 seconds
          throw new APICallError({
            message: 'Rate limited',
            url: 'https://api.anthropic.com/v1/messages',
            requestBodyValues: {},
            statusCode: 429,
            isRetryable: true,
            data: undefined,
            responseHeaders: {
              'retry-after-ms': '2000',
            },
          });
        }
        return { content: 'Success after retries!' };
      });

      const promise = retryWithExponentialBackoffRespectingRetryHeaders({
        maxRetries: 3,
      })(fn);

      // First retry - uses rate limit delay (5000ms)
      await vi.advanceTimersByTimeAsync(5000);
      expect(fn).toHaveBeenCalledTimes(2);

      // Second retry - uses exponential backoff (4000ms) which is > rate limit delay (2000ms)
      await vi.advanceTimersByTimeAsync(4000);
      expect(fn).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result).toEqual({ content: 'Success after retries!' });
    });

    it('should prefer retry-after-ms over retry-after when both present', async () => {
      let attempt = 0;

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          throw new APICallError({
            message: 'Rate limited',
            url: 'https://api.example.com/v1/messages',
            requestBodyValues: {},
            statusCode: 429,
            isRetryable: true,
            data: undefined,
            responseHeaders: {
              'retry-after-ms': '3000', // 3 seconds - should use this
              'retry-after': '10', // 10 seconds - should ignore
            },
          });
        }
        return 'success';
      });

      const promise = retryWithExponentialBackoffRespectingRetryHeaders()(fn);

      // Should use 3 second delay from retry-after-ms
      await vi.advanceTimersByTimeAsync(3000);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should handle retry-after header with HTTP date format', async () => {
      let attempt = 0;
      const baseTime = 1700000000000;
      const delayMs = 5000;

      vi.setSystemTime(baseTime);

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          const futureDate = new Date(baseTime + delayMs).toUTCString();
          throw new APICallError({
            message: 'Rate limit exceeded',
            url: 'https://api.example.com/v1/endpoint',
            requestBodyValues: {},
            statusCode: 429,
            isRetryable: true,
            data: undefined,
            responseHeaders: {
              'retry-after': futureDate,
            },
          });
        }
        return { data: 'success' };
      });

      const promise = retryWithExponentialBackoffRespectingRetryHeaders()(fn);

      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(1);

      // Should wait for 5 seconds
      await vi.advanceTimersByTimeAsync(delayMs - 100);
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toEqual({ data: 'success' });
    });

    it('should fall back to exponential backoff when rate limit delay is negative', async () => {
      let attempt = 0;
      const initialDelay = 2000;

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          throw new APICallError({
            message: 'Rate limited',
            url: 'https://api.example.com',
            requestBodyValues: {},
            statusCode: 429,
            isRetryable: true,
            data: undefined,
            responseHeaders: {
              'retry-after-ms': '-1000', // Negative value
            },
          });
        }
        return 'success';
      });

      const promise = retryWithExponentialBackoffRespectingRetryHeaders({
        initialDelayInMs: initialDelay,
      })(fn);

      // Should use exponential backoff delay (2000ms) not the negative rate limit
      await vi.advanceTimersByTimeAsync(initialDelay - 100);
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('success');
    });
  });

  describe('GatewayError retry support (issue #14216)', () => {
    it('should retry retryable GatewayInternalServerError (503)', async () => {
      let attempt = 0;
      const initialDelay = 2000;

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          throw new GatewayInternalServerError({
            message: 'Service temporarily unavailable',
            statusCode: 503,
          });
        }
        return 'success';
      });

      const promise = retryWithExponentialBackoffRespectingRetryHeaders({
        initialDelayInMs: initialDelay,
      })(fn);

      await vi.advanceTimersByTimeAsync(initialDelay);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should retry retryable GatewayRateLimitError (429)', async () => {
      let attempt = 0;
      const initialDelay = 2000;

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          throw new GatewayRateLimitError({
            message: 'Rate limit exceeded',
            statusCode: 429,
          });
        }
        return 'success';
      });

      const promise = retryWithExponentialBackoffRespectingRetryHeaders({
        initialDelayInMs: initialDelay,
      })(fn);

      await vi.advanceTimersByTimeAsync(initialDelay);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should retry retryable GatewayInternalServerError with timeout status (408)', async () => {
      let attempt = 0;
      const initialDelay = 2000;

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          throw new GatewayInternalServerError({
            message: 'Request timed out',
            statusCode: 408,
          });
        }
        return 'success';
      });

      const promise = retryWithExponentialBackoffRespectingRetryHeaders({
        initialDelayInMs: initialDelay,
      })(fn);

      await vi.advanceTimersByTimeAsync(initialDelay);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should NOT retry non-retryable GatewayAuthenticationError (401)', async () => {
      const fn = vi.fn().mockImplementation(async () => {
        throw new GatewayAuthenticationError({
          message: 'Invalid API key',
          statusCode: 401,
        });
      });

      await expect(
        retryWithExponentialBackoffRespectingRetryHeaders({ maxRetries: 2 })(
          fn,
        ),
      ).rejects.toThrow('Invalid API key');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry non-retryable GatewayInvalidRequestError (400)', async () => {
      const fn = vi.fn().mockImplementation(async () => {
        throw new GatewayInvalidRequestError({
          message: 'Bad request',
          statusCode: 400,
        });
      });

      await expect(
        retryWithExponentialBackoffRespectingRetryHeaders({ maxRetries: 2 })(
          fn,
        ),
      ).rejects.toThrow('Bad request');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should preserve isRetryable from original APICallError through gateway conversion', async () => {
      let attempt = 0;
      const initialDelay = 2000;

      // Simulate what asGatewayError does: wraps APICallError into GatewayInternalServerError
      const originalApiError = new APICallError({
        message: 'Server error',
        url: 'https://api.gateway.example.com',
        requestBodyValues: {},
        statusCode: 503,
        isRetryable: true,
      });

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          throw new GatewayInternalServerError({
            message: 'Gateway request failed',
            statusCode: 503,
            cause: originalApiError,
            isRetryable: originalApiError.isRetryable,
          });
        }
        return 'success';
      });

      const promise = retryWithExponentialBackoffRespectingRetryHeaders({
        initialDelayInMs: initialDelay,
      })(fn);

      await vi.advanceTimersByTimeAsync(initialDelay);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should extract retry-after headers from cause APICallError in GatewayError', async () => {
      let attempt = 0;
      const retryAfterMs = 5000;

      const originalApiError = new APICallError({
        message: 'Rate limited',
        url: 'https://api.gateway.example.com',
        requestBodyValues: {},
        statusCode: 429,
        isRetryable: true,
        responseHeaders: {
          'retry-after-ms': retryAfterMs.toString(),
        },
      });

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          throw new GatewayRateLimitError({
            message: 'Rate limit exceeded',
            statusCode: 429,
            cause: originalApiError,
            isRetryable: true,
          });
        }
        return 'success';
      });

      const promise = retryWithExponentialBackoffRespectingRetryHeaders()(fn);

      // Should use retry-after-ms from the cause APICallError
      await vi.advanceTimersByTimeAsync(retryAfterMs - 100);
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should respect maxRetries limit for GatewayError', async () => {
      const fn = vi.fn().mockImplementation(async () => {
        throw new GatewayInternalServerError({
          message: 'Persistent server error',
          statusCode: 500,
        });
      });

      const promise = retryWithExponentialBackoffRespectingRetryHeaders({
        maxRetries: 2,
        initialDelayInMs: 100,
      })(fn);

      // Catch the rejection to prevent unhandled rejection warnings
      const resultPromise = promise.catch(e => e);

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(100); // first retry delay
      await vi.advanceTimersByTimeAsync(200); // second retry delay (backoff)

      const error = await resultPromise;
      expect(error.message).toContain('Failed after 3 attempts');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry GatewayError with isRetryable explicitly set to false', async () => {
      const fn = vi.fn().mockImplementation(async () => {
        throw new GatewayInternalServerError({
          message: 'Non-retryable server error',
          statusCode: 500,
          isRetryable: false,
        });
      });

      await expect(
        retryWithExponentialBackoffRespectingRetryHeaders({ maxRetries: 2 })(
          fn,
        ),
      ).rejects.toThrow('Non-retryable server error');

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
