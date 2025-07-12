import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { APICallError } from '@ai-sdk/provider';
import { retryWithExponentialBackoff } from './retry-with-exponential-backoff';

describe('retryWithExponentialBackoff', () => {
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

    const promise = retryWithExponentialBackoff()(fn);

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

    const promise = retryWithExponentialBackoff()(fn);

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

    const promise = retryWithExponentialBackoff({ initialDelayInMs: initialDelay })(fn);

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

    const promise = retryWithExponentialBackoff({ initialDelayInMs: initialDelay })(fn);

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

    const promise = retryWithExponentialBackoff({ initialDelayInMs: initialDelay })(fn);

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
                message: 'Rate limit exceeded'
              }
            },
            responseHeaders: {
              'retry-after-ms': delayMs.toString(),
              'x-request-id': 'req_123456',
            },
          });
        }
        return { content: 'Hello from Claude!' };
      });

      const promise = retryWithExponentialBackoff()(fn);

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
                code: 'rate_limit_exceeded'
              }
            },
            responseHeaders: {
              'retry-after': delaySeconds.toString(),
              'x-request-id': 'req_abcdef123456',
            },
          });
        }
        return { choices: [{ message: { content: 'Hello from GPT!' } }] };
      });

      const promise = retryWithExponentialBackoff()(fn);

      // Should use the delay from retry-after header (30 seconds)
      await vi.advanceTimersByTimeAsync(delaySeconds * 1000 - 100);
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toEqual({ choices: [{ message: { content: 'Hello from GPT!' } }] });
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

      const promise = retryWithExponentialBackoff({ maxRetries: 3 })(fn);

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

      const promise = retryWithExponentialBackoff()(fn);

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

      const promise = retryWithExponentialBackoff()(fn);

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

      const promise = retryWithExponentialBackoff({ initialDelayInMs: initialDelay })(fn);

      // Should use exponential backoff delay (2000ms) not the negative rate limit
      await vi.advanceTimersByTimeAsync(initialDelay - 100);
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('success');
    });
  });

  describe('custom retry strategy', () => {
    it('should use custom retryDelay function when provided', async () => {
      let attempt = 0;
      const customDelays = [1000, 2000, 3000];

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt <= 2) {
          throw new APICallError({
            message: 'API error',
            url: 'https://api.example.com',
            requestBodyValues: {},
            isRetryable: true,
            data: undefined,
          });
        }
        return 'success';
      });

      const promise = retryWithExponentialBackoff({
        maxRetries: 3,
        retryStrategy: {
          retryDelay: (attempt) => customDelays[attempt - 1],
        },
      })(fn);

      // First attempt fails immediately
      expect(fn).toHaveBeenCalledTimes(1);

      // Should use custom delay (1000ms)
      await vi.advanceTimersByTimeAsync(900);
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(2);

      // Should use custom delay (2000ms)
      await vi.advanceTimersByTimeAsync(1900);
      expect(fn).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should have access to error in custom retryDelay function', async () => {
      let attempt = 0;
      const retryDelayFn = vi.fn((attempt, error) => {
        expect(error).toBeInstanceOf(APICallError);
        expect(error.responseHeaders).toBeDefined();
        return 1000;
      });

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          throw new APICallError({
            message: 'API error',
            url: 'https://api.example.com',
            requestBodyValues: {},
            isRetryable: true,
            data: undefined,
            responseHeaders: {
              'x-custom-header': 'test',
            },
          });
        }
        return 'success';
      });

      const promise = retryWithExponentialBackoff({
        maxRetries: 2,
        retryStrategy: {
          retryDelay: retryDelayFn,
        },
      })(fn);

      await vi.advanceTimersByTimeAsync(1100);
      const result = await promise;

      expect(retryDelayFn).toHaveBeenCalledTimes(1);
      expect(retryDelayFn).toHaveBeenCalledWith(1, expect.objectContaining({
        responseHeaders: {
          'x-custom-header': 'test',
        },
      }));
      expect(result).toBe('success');
    });

    it('should respect respectRateLimitHeaders flag when false', async () => {
      let attempt = 0;

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
              'retry-after-ms': '5000',
            },
          });
        }
        return 'success';
      });

      const promise = retryWithExponentialBackoff({
        maxRetries: 2,
        initialDelayInMs: 1000,
        retryStrategy: {
          respectRateLimitHeaders: false,
        },
      })(fn);

      // Should use exponential backoff (1000ms), not rate limit header (5000ms)
      await vi.advanceTimersByTimeAsync(900);
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should respect rate limit headers by default', async () => {
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

      const promise = retryWithExponentialBackoff({
        maxRetries: 2,
        initialDelayInMs: 1000,
        retryStrategy: {
          // respectRateLimitHeaders is true by default
        },
      })(fn);

      // Should use rate limit delay (3000ms), not exponential backoff (1000ms)
      await vi.advanceTimersByTimeAsync(2900);
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should work with empty retry strategy object', async () => {
      let attempt = 0;

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          throw new APICallError({
            message: 'API error',
            url: 'https://api.example.com',
            requestBodyValues: {},
            isRetryable: true,
            data: undefined,
          });
        }
        return 'success';
      });

      const promise = retryWithExponentialBackoff({
        maxRetries: 2,
        initialDelayInMs: 1000,
        retryStrategy: {},
      })(fn);

      // Should use default exponential backoff
      await vi.advanceTimersByTimeAsync(1100);
      const result = await promise;
      expect(result).toBe('success');
    });
  });
});