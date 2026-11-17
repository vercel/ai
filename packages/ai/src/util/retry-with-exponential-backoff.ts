import { APICallError } from '@ai-sdk/provider';
import { GatewayError } from '@ai-sdk/gateway';
import {
  retryWithExponentialBackoff,
  type RetryFunction,
  type ShouldRetryFunction,
} from '@ai-sdk/provider-utils';
import { RetryError } from './retry-error';

export function getRetryDelayInMs({
  error,
  responseHeaders,
  exponentialBackoffDelay,
}: {
  error: unknown;
  responseHeaders?: Record<string, string>;
  exponentialBackoffDelay: number;
}): number {
  const headers = APICallError.isInstance(error)
    ? (error.responseHeaders ?? responseHeaders)
    : GatewayError.isInstance(error) && APICallError.isInstance(error.cause)
      ? (error.cause.responseHeaders ?? responseHeaders)
      : responseHeaders;

  if (!headers) return exponentialBackoffDelay;

  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  let ms: number | undefined;

  // retry-ms is more precise than retry-after and used by e.g. OpenAI
  const retryAfterMs = normalizedHeaders['retry-after-ms'];
  if (retryAfterMs) {
    const timeoutMs = parseFloat(retryAfterMs);
    if (!Number.isNaN(timeoutMs)) {
      ms = timeoutMs;
    }
  }

  // About the Retry-After header: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After
  const retryAfter = normalizedHeaders['retry-after'];
  if (retryAfter && ms === undefined) {
    const timeoutSeconds = parseFloat(retryAfter);
    if (!Number.isNaN(timeoutSeconds)) {
      ms = timeoutSeconds * 1000;
    } else {
      ms = Date.parse(retryAfter) - Date.now();
    }
  }

  // check that the delay is reasonable:
  if (
    ms != null &&
    !Number.isNaN(ms) &&
    0 <= ms &&
    (ms < 60 * 1000 || ms < exponentialBackoffDelay)
  ) {
    return ms;
  }

  return exponentialBackoffDelay;
}

/**
 * The `retryWithExponentialBackoffRespectingRetryHeaders` strategy retries a failed API call with an exponential backoff,
 * while respecting rate limit headers (retry-after-ms and retry-after) if they are provided and reasonable (0-60 seconds).
 * You can configure the maximum number of retries, the initial delay, and the backoff factor.
 */
export const retryWithExponentialBackoffRespectingRetryHeaders = ({
  maxRetries = 2,
  initialDelayInMs = 2000,
  backoffFactor = 2,
  abortSignal,
  additionalRetryableError,
}: {
  maxRetries?: number;
  initialDelayInMs?: number;
  backoffFactor?: number;
  abortSignal?: AbortSignal;
  additionalRetryableError?: ShouldRetryFunction;
} = {}): RetryFunction =>
  retryWithExponentialBackoff({
    maxRetries,
    initialDelayInMs,
    backoffFactor,
    abortSignal,
    shouldRetry: async error =>
      (error instanceof Error &&
        ((APICallError.isInstance(error) && error.isRetryable === true) ||
          (GatewayError.isInstance(error) && error.isRetryable === true))) ||
      (additionalRetryableError != null &&
        (await additionalRetryableError(error))),
    getDelayInMs: ({ error, exponentialBackoffDelay }) =>
      getRetryDelayInMs({
        error,
        exponentialBackoffDelay,
      }),
    createRetryError: ({ message, reason, errors }) =>
      new RetryError({ message, reason, errors }),
  });
