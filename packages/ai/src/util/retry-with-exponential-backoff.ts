import { APICallError } from '@ai-sdk/provider';
import { delay, getErrorMessage, isAbortError } from '@ai-sdk/provider-utils';
import { RetryError } from './retry-error';

export type RetryFunction = <OUTPUT>(
  fn: () => PromiseLike<OUTPUT>,
) => PromiseLike<OUTPUT>;

/**
 * Parse rate limit headers and return delay in milliseconds.
 * Returns null if no rate limit headers are found.
 */
function parseRateLimitHeaders(error: APICallError): number | null {
  const headers = error.responseHeaders;
  if (!headers) return null;

  // Check for retry-after-ms header (used by some providers like Anthropic)
  const retryAfterMs = headers['retry-after-ms'];
  if (retryAfterMs) {
    const delay = parseInt(retryAfterMs, 10);
    if (!isNaN(delay) && delay > 0) {
      return delay;
    }
  }

  // Check for standard retry-after header
  const retryAfter = headers['retry-after'];
  if (retryAfter) {
    // First, try to parse as a number (seconds)
    const retryAfterSeconds = parseInt(retryAfter, 10);
    if (!isNaN(retryAfterSeconds)) {
      return retryAfterSeconds * 1000;
    }

    // If not a number, try to parse as HTTP date
    const retryAfterDate = new Date(retryAfter);
    if (!isNaN(retryAfterDate.getTime())) {
      const now = Date.now();
      const delay = retryAfterDate.getTime() - now;
      if (delay > 0) {
        return delay;
      }
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
  } = {}): RetryFunction =>
  async <OUTPUT>(f: () => PromiseLike<OUTPUT>) =>
    _retryWithExponentialBackoff(f, {
      maxRetries,
      delayInMs: initialDelayInMs,
      backoffFactor,
    });

async function _retryWithExponentialBackoff<OUTPUT>(
  f: () => PromiseLike<OUTPUT>,
  {
    maxRetries,
    delayInMs,
    backoffFactor,
  }: { maxRetries: number; delayInMs: number; backoffFactor: number },
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
      // Check for rate limit headers and use the maximum of rate limit delay and exponential backoff
      const rateLimitDelay = parseRateLimitHeaders(error);
      const actualDelay = rateLimitDelay !== null 
        ? Math.max(rateLimitDelay, delayInMs) 
        : delayInMs;
      
      await delay(actualDelay);
      return _retryWithExponentialBackoff(
        f,
        { maxRetries, delayInMs: backoffFactor * delayInMs, backoffFactor },
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
