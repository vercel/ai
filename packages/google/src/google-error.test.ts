import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { googleFailedResponseHandler } from './google-error';

const responseBody = readFileSync(
  new URL('./__fixtures__/google-429-retry-info.json', import.meta.url),
  'utf8',
);

describe('googleFailedResponseHandler', () => {
  it('preserves Google error details, including google.rpc.RetryInfo, in APICallError.data', async () => {
    const { value: error } = await googleFailedResponseHandler({
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      requestBodyValues: { contents: [] },
      response: new Response(responseBody, {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    });

    expect(error.statusCode).toBe(429);
    expect(error.isRetryable).toBe(true);
    expect(error.responseHeaders?.['retry-after']).toBeUndefined();
    expect(error.responseBody).toBe(responseBody);
    expect(error.data).toEqual(JSON.parse(responseBody));
    expect(error.data).toMatchObject({
      error: {
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          },
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '34.4s',
          },
        ],
      },
    });
  });
});
