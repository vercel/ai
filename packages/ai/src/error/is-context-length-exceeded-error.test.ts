import { GatewayInternalServerError } from '@ai-sdk/gateway';
import { APICallError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { RetryError } from '../util/retry-error';
import { isContextLengthExceededError } from './is-context-length-exceeded-error';
import { StreamProviderError } from './stream-provider-error';

function apiCallError(failureReason?: 'context-length-exceeded') {
  return new APICallError({
    message: 'prompt is too long: 215000 tokens > 200000 maximum',
    url: 'https://api.anthropic.com/v1/messages',
    requestBodyValues: {},
    statusCode: 400,
    failureReason,
  });
}

describe('isContextLengthExceededError', () => {
  it.each([
    ['APICallError', apiCallError('context-length-exceeded')],
    [
      'StreamProviderError',
      new StreamProviderError({
        message: 'Your input exceeds the context window of this model.',
        statusCode: 400,
        failureReason: 'context-length-exceeded',
      }),
    ],
    [
      'GatewayError',
      new GatewayInternalServerError({
        message: 'prompt is too long: 215000 tokens > 200000 maximum',
        statusCode: 400,
        failureReason: 'context-length-exceeded',
      }),
    ],
    [
      'RetryError whose last attempt overflowed',
      new RetryError({
        message: 'Failed after 2 attempts.',
        reason: 'errorNotRetryable',
        errors: [
          new APICallError({
            message: 'Overloaded',
            url: 'https://api.anthropic.com/v1/messages',
            requestBodyValues: {},
            statusCode: 529,
          }),
          apiCallError('context-length-exceeded'),
        ],
      }),
    ],
  ])('recognizes %s', (_name, error) => {
    expect(isContextLengthExceededError(error)).toBe(true);
  });

  it.each([
    ['an unclassified APICallError', apiCallError()],
    ['a plain Error with the same message', new Error(apiCallError().message)],
    ['a non-error value', 'context-length-exceeded'],
  ])('rejects %s', (_name, error) => {
    expect(isContextLengthExceededError(error)).toBe(false);
  });
});
