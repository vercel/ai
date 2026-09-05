import { InvalidArgumentError } from '../error/invalid-argument-error';
import type { RetryFunction } from '@ai-sdk/provider-utils';
import { retryWithExponentialBackoffRespectingRetryHeaders } from '../util/retry-with-exponential-backoff';

const DEFAULT_INITIAL_DELAY_MS = 2000;
const DEFAULT_BACKOFF_FACTOR = 2;

/**
 * Validate and prepare retries.
 */
export function prepareRetries({
  maxRetries,
  abortSignal,
  parameter = 'maxRetries',
  defaultMaxRetries = 2,
}: {
  maxRetries: number | undefined;
  abortSignal: AbortSignal | undefined;
  parameter?: string;
  defaultMaxRetries?: number;
}): {
  maxRetries: number;
  retry: RetryFunction;
  getDelay: (attempt: number) => number;
} {
  if (maxRetries != null) {
    if (!Number.isInteger(maxRetries)) {
      throw new InvalidArgumentError({
        parameter,
        value: maxRetries,
        message: `${parameter} must be an integer`,
      });
    }

    if (maxRetries < 0) {
      throw new InvalidArgumentError({
        parameter,
        value: maxRetries,
        message: `${parameter} must be >= 0`,
      });
    }
  }

  const maxRetriesResult = maxRetries ?? defaultMaxRetries;

  return {
    maxRetries: maxRetriesResult,
    retry: retryWithExponentialBackoffRespectingRetryHeaders({
      maxRetries: maxRetriesResult,
      abortSignal,
    }),
    getDelay: (attempt: number) =>
      Math.min(
        DEFAULT_INITIAL_DELAY_MS * Math.pow(DEFAULT_BACKOFF_FACTOR, attempt),
        60000,
      ),
  };
}
