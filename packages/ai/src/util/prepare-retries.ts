import { InvalidArgumentError } from '../error/invalid-argument-error';
import type {
  RetryFunction,
  ShouldRetryFunction,
} from '@ai-sdk/provider-utils';
import { retryWithExponentialBackoffRespectingRetryHeaders } from '../util/retry-with-exponential-backoff';

/**
 * Validate and prepare retries.
 */
export function prepareRetries({
  maxRetries,
  abortSignal,
  additionalRetryableError,
}: {
  maxRetries: number | undefined;
  abortSignal: AbortSignal | undefined;
  additionalRetryableError?: ShouldRetryFunction;
}): {
  maxRetries: number;
  retry: RetryFunction;
} {
  if (maxRetries != null) {
    if (!Number.isInteger(maxRetries)) {
      throw new InvalidArgumentError({
        parameter: 'maxRetries',
        value: maxRetries,
        message: 'maxRetries must be an integer',
      });
    }

    if (maxRetries < 0) {
      throw new InvalidArgumentError({
        parameter: 'maxRetries',
        value: maxRetries,
        message: 'maxRetries must be >= 0',
      });
    }
  }

  const maxRetriesResult = maxRetries ?? 2;

  return {
    maxRetries: maxRetriesResult,
    retry: retryWithExponentialBackoffRespectingRetryHeaders({
      maxRetries: maxRetriesResult,
      abortSignal,
      additionalRetryableError,
    }),
  };
}
