import { InvalidArgumentError } from '../../errors/invalid-argument-error';
import {
  RetryFunction,
  retryWithExponentialBackoff,
} from '../../util/retry-with-exponential-backoff';

/**
 * Validate and prepare retries.
 */
export function prepareRetries({
  maxRetries,
}: {
  maxRetries: number | undefined;
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
    retry: retryWithExponentialBackoff({ maxRetries: maxRetriesResult }),
  };
}
