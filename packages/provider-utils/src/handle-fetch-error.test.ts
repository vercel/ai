import { APICallError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { handleFetchError } from './handle-fetch-error';

const testUrl = 'https://api.example.com/v1/chat';
const testRequestBodyValues = { prompt: 'test' };

describe('handleFetchError', () => {
  it('should mark nested Undici socket errors as retryable', () => {
    const socketError = Object.assign(new Error('other side closed'), {
      code: 'UND_ERR_SOCKET',
    });
    const terminatedError = new TypeError('terminated') as TypeError & {
      cause?: unknown;
    };
    terminatedError.cause = socketError;
    const apiCallError = new APICallError({
      message: 'Failed to process successful response',
      cause: terminatedError,
      url: testUrl,
      requestBodyValues: testRequestBodyValues,
      statusCode: 200,
      responseHeaders: { 'x-request-id': 'request-id' },
      responseBody: 'partial response',
      data: { partial: true },
    });

    const result = handleFetchError({
      error: apiCallError,
      url: testUrl,
      requestBodyValues: testRequestBodyValues,
    });

    expect(APICallError.isInstance(result)).toBe(true);
    expect(result).toMatchObject({
      message: 'Failed to process successful response',
      cause: terminatedError,
      url: testUrl,
      requestBodyValues: testRequestBodyValues,
      statusCode: 200,
      responseHeaders: { 'x-request-id': 'request-id' },
      responseBody: 'partial response',
      data: { partial: true },
      isRetryable: true,
    });
  });

  it('should stop traversing cyclic error causes', () => {
    const error = new Error('cyclic') as Error & { cause?: unknown };
    error.cause = error;

    const result = handleFetchError({
      error,
      url: testUrl,
      requestBodyValues: testRequestBodyValues,
    });

    expect(result).toBe(error);
  });
});
