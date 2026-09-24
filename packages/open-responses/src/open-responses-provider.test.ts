import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { createOpenResponses } from './open-responses-provider';

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
  },
];

const error = {
  code: 'busy',
  message: 'Try again later.',
  http_status: 503,
  retry: false,
};

describe('endpoint-specific response error metadata', () => {
  it('maps generation failures without assuming a vendor status field', async () => {
    const provider = createOpenResponses({
      name: 'acme',
      url: 'https://example.com/responses',
      getResponseErrorMetadata: error => ({
        statusCode: error.http_status as number,
        isRetryable: error.retry as boolean,
      }),
      fetch: async () => Response.json({ error, status: 'failed', output: [] }),
    });
    await expect(
      provider('model').doGenerate({ prompt }),
    ).rejects.toMatchObject({
      statusCode: 503,
      isRetryable: false,
      data: error,
    });
  });

  it.each(['response.failed', 'error'])(
    'maps %s stream errors with the same callback',
    async type => {
      const event =
        type === 'response.failed'
          ? {
              type,
              sequence_number: 1,
              response: { status: 'failed', error, output: [] },
            }
          : { type, sequence_number: 1, error };
      const provider = createOpenResponses({
        name: 'acme',
        url: 'https://example.com/responses',
        getResponseErrorMetadata: error => ({
          statusCode: error.http_status as number,
          isRetryable: error.retry as boolean,
        }),
        fetch: async () =>
          new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      });
      const result = await provider('model').doStream({ prompt });
      const parts = await convertReadableStreamToArray(result.stream);
      expect(parts).toContainEqual({
        type: 'error',
        error: expect.objectContaining({
          statusCode: 503,
          isRetryable: false,
          data: event,
        }),
      });
    },
  );

  it('does not interpret vendor error fields unless configured', async () => {
    const provider = createOpenResponses({
      name: 'acme',
      url: 'https://example.com/responses',
      fetch: async () =>
        Response.json({
          error: { ...error, status_code: 503 },
          status: 'failed',
          output: [],
        }),
    });
    await expect(
      provider('model').doGenerate({ prompt }),
    ).rejects.toMatchObject({
      statusCode: 400,
      isRetryable: false,
    });
  });
});
