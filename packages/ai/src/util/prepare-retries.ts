import { InvalidArgumentError } from '../error/invalid-argument-error';
<<<<<<< HEAD
import {
  type RetryFunction,
  retryWithExponentialBackoffRespectingRetryHeaders,
} from '../util/retry-with-exponential-backoff';

=======
import type {
  RetryFunction,
  ShouldRetryFunction,
} from '@ai-sdk/provider-utils';
import { retryWithExponentialBackoffRespectingRetryHeaders } from '../util/retry-with-exponential-backoff';
>>>>>>> 45099daf24 (fix: generateImage maxRetries skips transient empty image results (#20170))
/**
 * Validate and prepare retries.
 */
export function prepareRetries({
  maxRetries,
  abortSignal,
<<<<<<< HEAD
}: {
  maxRetries: number | undefined;
  abortSignal: AbortSignal | undefined;
=======
  additionalRetryableError,
  parameter = 'maxRetries',
  defaultMaxRetries = 2,
}: {
  maxRetries: number | undefined;
  abortSignal: AbortSignal | undefined;
  additionalRetryableError?: ShouldRetryFunction;
  parameter?: string;
  defaultMaxRetries?: number;
>>>>>>> 45099daf24 (fix: generateImage maxRetries skips transient empty image results (#20170))
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
