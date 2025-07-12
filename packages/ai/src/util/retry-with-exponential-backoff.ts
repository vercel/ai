import { APICallError } from '@ai-sdk/provider';
import { delay, getErrorMessage, isAbortError } from '@ai-sdk/provider-utils';
import { RetryError } from './retry-error';

export type RetryFunction = <OUTPUT>(
  fn: () => PromiseLike<OUTPUT>,
) => PromiseLike<OUTPUT>;

export interface RetryStrategy {
  retryDelay?: (attempt: number, error?: APICallError) => number;
  respectRateLimitHeaders?: boolean;
}

/**
 * Parse rate limit headers from different providers
 * Returns delay in milliseconds or null if no rate limit headers found
 */
function parseRateLimitHeaders(error: APICallError): number | null {
  const headers = error.responseHeaders;
  if (!headers) return null;

  // Anthropic rate limit headers (RFC 3339 format)
  const anthropicResetHeaders = [
    'anthropic-ratelimit-input-tokens-reset',
    'anthropic-ratelimit-output-tokens-reset',
    'anthropic-ratelimit-requests-reset',
  ];
  
  for (const header of anthropicResetHeaders) {
    const resetTime = headers[header];
    if (resetTime) {
      try {
        const resetDate = new Date(resetTime);
        const now = Date.now();
        const delayMs = Math.max(0, resetDate.getTime() - now);
        if (delayMs > 0) return delayMs;
      } catch (e) {
        // Invalid date format, continue to next header
      }
    }
  }

  // OpenAI rate limit headers (Unix timestamp)
  const openAIResetHeaders = [
    'x-ratelimit-reset-requests',
    'x-ratelimit-reset-tokens',
    'x-ratelimit-reset',
  ];
  
  for (const header of openAIResetHeaders) {
    const resetTime = headers[header];
    if (resetTime) {
      try {
        const resetTimestamp = parseInt(resetTime, 10) * 1000; // Convert to milliseconds
        const now = Date.now();
        const delayMs = Math.max(0, resetTimestamp - now);
        if (delayMs > 0) return delayMs;
      } catch (e) {
        // Invalid timestamp, continue to next header
      }
    }
  }

  // Standard Retry-After header (seconds or HTTP date)
  const retryAfter = headers['retry-after'];
  if (retryAfter) {
    // Check if it's a number (seconds)
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
    
    // Try parsing as HTTP date
    try {
      const retryDate = new Date(retryAfter);
      const now = Date.now();
      const delayMs = Math.max(0, retryDate.getTime() - now);
      if (delayMs > 0) return delayMs;
    } catch (e) {
      // Invalid date format
    }
  }

  return null;
}

/**
The `retryWithExponentialBackoff` strategy retries a failed API call with an exponential backoff.
You can configure the maximum number of retries, the initial delay, and the backoff factor.
 */
export const retryWithExponentialBackoff =
  ({
    maxRetries = 2,
    initialDelayInMs = 2000,
    backoffFactor = 2,
    retryStrategy,
  }: {
    maxRetries?: number;
    initialDelayInMs?: number;
    backoffFactor?: number;
    retryStrategy?: RetryStrategy;
  } = {}): RetryFunction =>
  async <OUTPUT>(f: () => PromiseLike<OUTPUT>) =>
    _retryWithExponentialBackoff(f, {
      maxRetries,
      delayInMs: initialDelayInMs,
      backoffFactor,
      retryStrategy,
    });

async function _retryWithExponentialBackoff<OUTPUT>(
  f: () => PromiseLike<OUTPUT>,
  {
    maxRetries,
    delayInMs,
    backoffFactor,
    retryStrategy,
  }: {
    maxRetries: number;
    delayInMs: number;
    backoffFactor: number;
    retryStrategy?: RetryStrategy;
  },
  errors: unknown[] = [],
): Promise<OUTPUT> {
  try {
    return await f();
  } catch (error) {
    if (isAbortError(error)) {
      throw error; // don't retry when the request was aborted
    }

    if (maxRetries === 0) {
      throw error; // don't wrap the error when retries are disabled
    }

    const errorMessage = getErrorMessage(error);
    const newErrors = [...errors, error];
    const tryNumber = newErrors.length;

    if (tryNumber > maxRetries) {
      throw new RetryError({
        message: `Failed after ${tryNumber} attempts. Last error: ${errorMessage}`,
        reason: 'maxRetriesExceeded',
        errors: newErrors,
      });
    }

    if (
      error instanceof Error &&
      APICallError.isInstance(error) &&
      error.isRetryable === true &&
      tryNumber <= maxRetries
    ) {
      // Calculate delay using custom strategy or default exponential backoff
      let retryDelayMs: number;
      
      if (retryStrategy?.retryDelay) {
        // Use custom retry delay function
        retryDelayMs = retryStrategy.retryDelay(tryNumber, error);
      } else if (retryStrategy?.respectRateLimitHeaders !== false) {
        // Check for rate limit headers
        const rateLimitDelay = parseRateLimitHeaders(error);
        retryDelayMs = rateLimitDelay ?? delayInMs;
      } else {
        // Use default exponential backoff
        retryDelayMs = delayInMs;
      }
      
      await delay(retryDelayMs);
      return _retryWithExponentialBackoff(
        f,
        { maxRetries, delayInMs: backoffFactor * delayInMs, backoffFactor, retryStrategy },
        newErrors,
      );
    }

    if (tryNumber === 1) {
      throw error; // don't wrap the error when a non-retryable error occurs on the first try
    }

    throw new RetryError({
      message: `Failed after ${tryNumber} attempts with non-retryable error: '${errorMessage}'`,
      reason: 'errorNotRetryable',
      errors: newErrors,
    });
  }
}
