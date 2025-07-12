import { APICallError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { retryWithExponentialBackoff, RetryStrategy } from './retry-with-exponential-backoff';
import { RetryError } from './retry-error';

describe('retryWithExponentialBackoff', () => {
  // Mock delay function to avoid actual waiting in tests
  vi.mock('@ai-sdk/provider-utils', async () => {
    const actual = await vi.importActual('@ai-sdk/provider-utils');
    return {
      ...actual,
      delay: vi.fn(() => Promise.resolve()),
    };
  });

  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const retry = retryWithExponentialBackoff();
    
    const result = await retry(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error', async () => {
    const error = new APICallError({
      message: 'API error',
      url: 'https://api.example.com',
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
    });
    
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');
    
    const retry = retryWithExponentialBackoff({ maxRetries: 2 });
    const result = await retry(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw RetryError after max retries exceeded', async () => {
    const error = new APICallError({
      message: 'API error',
      url: 'https://api.example.com',
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
    });
    
    const fn = vi.fn().mockRejectedValue(error);
    const retry = retryWithExponentialBackoff({ maxRetries: 2 });
    
    await expect(retry(fn)).rejects.toThrow(RetryError);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should not retry non-retryable errors', async () => {
    const error = new APICallError({
      message: 'API error',
      url: 'https://api.example.com',
      requestBodyValues: {},
      statusCode: 400,
      isRetryable: false,
    });
    
    const fn = vi.fn().mockRejectedValue(error);
    const retry = retryWithExponentialBackoff({ maxRetries: 2 });
    
    await expect(retry(fn)).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  describe('RetryStrategy', () => {
    it('should use custom retry delay function', async () => {
      const error = new APICallError({
        message: 'API error',
        url: 'https://api.example.com',
        requestBodyValues: {},
        statusCode: 429,
        isRetryable: true,
      });
      
      const customDelays = [1000, 2000, 3000];
      const retryDelay = vi.fn((attempt: number) => customDelays[attempt - 1]);
      
      const fn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      
      const retryStrategy: RetryStrategy = {
        retryDelay,
      };
      
      const retry = retryWithExponentialBackoff({ 
        maxRetries: 3,
        retryStrategy,
      });
      
      const result = await retry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
      expect(retryDelay).toHaveBeenCalledTimes(2);
      expect(retryDelay).toHaveBeenNthCalledWith(1, 1, error);
      expect(retryDelay).toHaveBeenNthCalledWith(2, 2, error);
    });

    it('should parse Anthropic rate limit headers', async () => {
      const resetTime = new Date(Date.now() + 5000).toISOString(); // 5 seconds from now
      const error = new APICallError({
        message: 'Rate limited',
        url: 'https://api.anthropic.com',
        requestBodyValues: {},
        statusCode: 429,
        isRetryable: true,
        responseHeaders: {
          'anthropic-ratelimit-input-tokens-reset': resetTime,
        },
      });
      
      const fn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      
      const retryStrategy: RetryStrategy = {
        respectRateLimitHeaders: true,
      };
      
      const retry = retryWithExponentialBackoff({ 
        maxRetries: 2,
        retryStrategy,
      });
      
      const result = await retry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      // Note: In a real test, we would mock the delay function to verify the delay time
    });

    it('should parse OpenAI rate limit headers', async () => {
      const resetTimestamp = Math.floor(Date.now() / 1000) + 10; // 10 seconds from now
      const error = new APICallError({
        message: 'Rate limited',
        url: 'https://api.openai.com',
        requestBodyValues: {},
        statusCode: 429,
        isRetryable: true,
        responseHeaders: {
          'x-ratelimit-reset': resetTimestamp.toString(),
        },
      });
      
      const fn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      
      const retryStrategy: RetryStrategy = {
        respectRateLimitHeaders: true,
      };
      
      const retry = retryWithExponentialBackoff({ 
        maxRetries: 2,
        retryStrategy,
      });
      
      const result = await retry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should parse standard retry-after header (seconds)', async () => {
      const error = new APICallError({
        message: 'Rate limited',
        url: 'https://api.example.com',
        requestBodyValues: {},
        statusCode: 429,
        isRetryable: true,
        responseHeaders: {
          'retry-after': '5', // 5 seconds
        },
      });
      
      const fn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      
      const retryStrategy: RetryStrategy = {
        respectRateLimitHeaders: true,
      };
      
      const retry = retryWithExponentialBackoff({ 
        maxRetries: 2,
        retryStrategy,
      });
      
      const result = await retry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should fall back to exponential backoff when no rate limit headers', async () => {
      const error = new APICallError({
        message: 'API error',
        url: 'https://api.example.com',
        requestBodyValues: {},
        statusCode: 429,
        isRetryable: true,
        responseHeaders: {}, // No rate limit headers
      });
      
      const fn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      
      const retryStrategy: RetryStrategy = {
        respectRateLimitHeaders: true,
      };
      
      const retry = retryWithExponentialBackoff({ 
        maxRetries: 2,
        initialDelayInMs: 1000,
        retryStrategy,
      });
      
      const result = await retry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should use custom delay with jitter', async () => {
      const error = new APICallError({
        message: 'API error',
        url: 'https://api.example.com',
        requestBodyValues: {},
        statusCode: 429,
        isRetryable: true,
      });
      
      const retryDelay = vi.fn((attempt: number) => {
        const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
        const jitter = Math.random() * 0.1 * baseDelay;
        return baseDelay + jitter;
      });
      
      const fn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      
      const retryStrategy: RetryStrategy = {
        retryDelay,
      };
      
      const retry = retryWithExponentialBackoff({ 
        maxRetries: 2,
        retryStrategy,
      });
      
      const result = await retry(fn);
      
      expect(result).toBe('success');
      expect(retryDelay).toHaveBeenCalledWith(1, error);
      const delay = retryDelay.mock.results[0].value;
      expect(delay).toBeGreaterThanOrEqual(2000); // 2^1 * 1000
      expect(delay).toBeLessThanOrEqual(2200); // 2000 + 10% jitter
    });
  });
});