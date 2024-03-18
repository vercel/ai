import {
  APICallError,
  RetryError,
  getErrorMessage,
} from '../../ai-model-specification';
import { delay } from './delay';

export type RetryFunction = <OUTPUT>(
  fn: () => PromiseLike<OUTPUT>,
) => PromiseLike<OUTPUT>;

/**
 * The `retryWithExponentialBackoff` strategy retries a failed API call with an exponential backoff.
 * You can configure the maximum number of retries, the initial delay, and the backoff factor.
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
    if (maxRetries === 0) {
      throw error; // don't wrap the error when retries are disabled
    }

    const errorMessage = getErrorMessage(error);
    const newErrors = [...errors, error];
    const tryNumber = newErrors.length;

    if (tryNumber > maxRetries) {
      throw new RetryError({
        message: `Failed after ${tryNumber} tries. Last error: ${errorMessage}`,
        reason: 'maxRetriesExceeded',
        errors: newErrors,
      });
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw error;
      }

      if (
        // deal with bundling duplication by using names
        APICallError.isAPICallError(error) &&
        error.isRetryable === true &&
        tryNumber <= maxRetries
      ) {
        await delay(delayInMs);
        return _retryWithExponentialBackoff(
          f,
          { maxRetries, delayInMs: backoffFactor * delayInMs, backoffFactor },
          newErrors,
        );
      }
    }

    throw new RetryError({
      message: `Failed after ${tryNumber} tries with non-retryable error: '${errorMessage}'`,
      reason: 'errorNotRetryable',
      errors: newErrors,
    });
  }
}
