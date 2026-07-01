import { InvalidArgumentError } from '../error/invalid-argument-error';
<<<<<<< HEAD
import {
  retryWithExponentialBackoffRespectingRetryHeaders,
  type RetryFunction,
} from '../util/retry-with-exponential-backoff';

=======
import type { RetryFunction } from '@ai-sdk/provider-utils';
import { retryWithExponentialBackoffRespectingRetryHeaders } from '../util/retry-with-exponential-backoff';
>>>>>>> 8c616f0305 (feat(mcp): add retry option for failed mcp tool calls (#16494))
/**
 * Validate and prepare retries.
 */
export function prepareRetries({
  maxRetries,
  abortSignal,
}: {
  maxRetries: number | undefined;
  abortSignal: AbortSignal | undefined;
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
    }),
  };
}
