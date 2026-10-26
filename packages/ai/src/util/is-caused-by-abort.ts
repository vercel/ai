import { isAbortError } from '@ai-sdk/provider-utils';

/**
 * Checks if the error is an abort or timeout error, or is caused by one.
 * Providers can wrap the abort or timeout error, e.g. as the cause of an
 * API call error.
 */
export function isCausedByAbort(error: unknown): boolean {
  let current = error;

  for (let depth = 0; current != null && depth < 5; depth++) {
    if (isAbortError(current)) {
      return true;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
