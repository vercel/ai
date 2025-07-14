import { APICallError } from '@ai-sdk/provider';
import { delay, getErrorMessage, isAbortError } from '@ai-sdk/provider-utils';
import { RetryError } from './retry-error';

export type RetryFunction = <OUTPUT>(
  fn: () => PromiseLike<OUTPUT>,
) => PromiseLike<OUTPUT>;

/**
 * Determines the retry delay for a failed API call by checking rate limit headers.
 *
 * This matches the implementation used by both Anthropic and OpenAI client SDKs:
 * - First checks for 'retry-after-ms' header (milliseconds)
 * - Falls back to 'retry-after' header (seconds or HTTP date)
 * - Only uses the header value if it's reasonable (between 0 and 60 seconds)
 * - Falls back to exponential backoff if no valid headers or if the delay is unreasonable
 *
 * @param error - The API call error containing response headers
 * @param exponentialBackoffDelay - The calculated exponential backoff delay to use as fallback
 * @returns The delay in milliseconds to wait before retrying
 */
function getRetryDelay(
  error: APICallError,
  exponentialBackoffDelay: number,
): number {
  const headers = error.responseHeaders;
  if (!headers) return exponentialBackoffDelay;

  let timeoutMillis: number | undefined;

  // Note the `retry-after-ms` header may not be standard, but is a good idea and we'd like proactive support for it.
  const retryAfterMs = headers['retry-after-ms'];
  if (retryAfterMs) {
    const timeoutMs = parseFloat(retryAfterMs);
    if (!Number.isNaN(timeoutMs)) {
      timeoutMillis = timeoutMs;
    }
  }

  // About the Retry-After header: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After
  const retryAfter = headers['retry-after'];
  if (retryAfter && timeoutMillis === undefined) {
    const timeoutSeconds = parseFloat(retryAfter);
    if (!Number.isNaN(timeoutSeconds)) {
      timeoutMillis = timeoutSeconds * 1000;
    } else {
      timeoutMillis = Date.parse(retryAfter) - Date.now();
    }
  }

  // If the API asks us to wait a certain amount of time (and it's a reasonable amount),
  // just do what it says, but otherwise calculate a default
  if (
    timeoutMillis !== undefined &&
    0 <= timeoutMillis &&
    timeoutMillis < 60 * 1000
  ) {
    return timeoutMillis;
  }

  return exponentialBackoffDelay;
}

/**
The `retryWithExponentialBackoffRespectingRetryHeaders` strategy retries a failed API call with an exponential backoff,
while respecting rate limit headers (retry-after-ms and retry-after) if they are provided and reasonable (0-60 seconds).
You can configure the maximum number of retries, the initial delay, and the backoff factor.
 */
export const retryWithExponentialBackoffRespectingRetryHeaders =
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
      // Check for rate limit headers and use them if reasonable (0-60s)
      const actualDelay = getRetryDelay(error, delayInMs);

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
