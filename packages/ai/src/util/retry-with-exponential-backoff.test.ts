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
    it('should use custom initial delay and backoff factor', async () => {
      let attempt = 0;
      const delays: number[] = [];
      let lastCallTime = 0;

      const fn = vi.fn().mockImplementation(async () => {
        const currentTime = Date.now();
        if (lastCallTime > 0) {
          delays.push(currentTime - lastCallTime);
        }
        lastCallTime = currentTime;
        
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
          initialDelayInMs: 500,
          backoffFactor: 3,
          respectRateLimitHeaders: false,
        },
      })(fn);

      // First attempt fails immediately
      expect(fn).toHaveBeenCalledTimes(1);

      // Should use custom initial delay (500ms)
      await vi.advanceTimersByTimeAsync(500);
      expect(fn).toHaveBeenCalledTimes(2);

      // Should use backoff factor of 3 (500 * 3 = 1500ms)
      await vi.advanceTimersByTimeAsync(1500);
      expect(fn).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result).toBe('success');
      
      // Verify the delays were correct (allowing for small timing variations)
      expect(delays[0]).toBeGreaterThanOrEqual(500);
      expect(delays[0]).toBeLessThanOrEqual(510);
      expect(delays[1]).toBeGreaterThanOrEqual(1500);
      expect(delays[1]).toBeLessThanOrEqual(1510);
    });

    it('should apply jitter when enabled', async () => {
      let attempt = 0;
      const delays: number[] = [];

      // Mock Math.random to return predictable values
      const mockRandom = vi.spyOn(Math, 'random').mockReturnValueOnce(0.5);

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
        retryStrategy: {
          initialDelayInMs: 1000,
          jitter: true,
          respectRateLimitHeaders: false,
        },
      })(fn);

      // With jitter, delay should be 1000 + (1000 * 0.1 * 0.5) = 1050ms
      await vi.advanceTimersByTimeAsync(1040);
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(20);
      expect(fn).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('success');

      mockRandom.mockRestore();
    });

    it('should respect maxDelayInMs when configured', async () => {
      let attempt = 0;

      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt <= 3) {
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
        maxRetries: 4,
        retryStrategy: {
          initialDelayInMs: 1000,
          backoffFactor: 10, // Would normally result in 1000, 10000, 100000
          maxDelayInMs: 5000, // Cap at 5000ms
          respectRateLimitHeaders: false,
        },
      })(fn);

      // First retry: 1000ms
      await vi.advanceTimersByTimeAsync(1100);
      expect(fn).toHaveBeenCalledTimes(2);

      // Second retry: capped at 5000ms (would be 10000ms without cap)
      await vi.advanceTimersByTimeAsync(5100);
      expect(fn).toHaveBeenCalledTimes(3);

      // Third retry: capped at 5000ms (would be 100000ms without cap)
      await vi.advanceTimersByTimeAsync(5100);
      expect(fn).toHaveBeenCalledTimes(4);

      const result = await promise;
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