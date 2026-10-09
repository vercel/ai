import { GatewayError } from '@ai-sdk/gateway';
import { APICallError } from '@ai-sdk/provider';
import { RetryError } from '../util/retry-error';
import { StreamProviderError } from './stream-provider-error';

/**
 * Checks whether a model call failed because the input plus the reserved
 * output tokens exceed the model's context window.
 *
 * Recognizes provider errors (`APICallError`), mid-stream provider errors
 * (`StreamProviderError`), AI Gateway errors (`GatewayError`), and a
 * `RetryError` whose last attempt failed for that reason. Shortening the input
 * or lowering `maxOutputTokens` may make the call succeed.
 */
export function isContextLengthExceededError(error: unknown): boolean {
  const candidate = RetryError.isInstance(error) ? error.lastError : error;

  return (
    (APICallError.isInstance(candidate) ||
      StreamProviderError.isInstance(candidate) ||
      GatewayError.isInstance(candidate)) &&
    candidate.failureReason === 'context-length-exceeded'
  );
}
