import { APICallError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { postJsonToApi } from './post-to-api';
import {
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
} from './response-handler';

describe('postJsonToApi', () => {
  it('should mark socket errors while reading successful response bodies as retryable', async () => {
    const socketError = Object.assign(new Error('other side closed'), {
      code: 'UND_ERR_SOCKET',
    });
    const terminatedError = new TypeError('terminated') as TypeError & {
      cause?: unknown;
    };
    terminatedError.cause = socketError;
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"value":'));
            controller.error(terminatedError);
          },
        }),
        {
          status: 200,
          headers: { 'x-request-id': 'request-id' },
        },
      ),
    );

    let observedError: unknown;
    try {
      await postJsonToApi({
        url: 'https://api.example.com/v1/generate',
        body: { prompt: 'test' },
        successfulResponseHandler: createJsonResponseHandler(
          z.object({ value: z.string() }),
        ),
        failedResponseHandler: createStatusCodeErrorResponseHandler(),
        fetch,
      });
    } catch (error) {
      observedError = error;
    }

    expect(APICallError.isInstance(observedError)).toBe(true);
    expect(observedError).toMatchObject({
      message: 'Failed to process successful response',
      cause: terminatedError,
      statusCode: 200,
      responseHeaders: { 'x-request-id': 'request-id' },
      isRetryable: true,
    });
  });
});
