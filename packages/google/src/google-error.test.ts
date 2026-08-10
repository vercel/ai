import { APICallError } from '@ai-sdk/provider';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { googleFailedResponseHandler } from './google-error';

const body = readFileSync(
  new URL('./__fixtures__/google-429-retry-info.json', import.meta.url),
  'utf8',
);

describe('googleFailedResponseHandler', () => {
  it('preserves RetryInfo details in APICallError.data', async () => {
    const response = new Response(body, {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });

    const { value } = await googleFailedResponseHandler({
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      requestBodyValues: {},
      response,
    });

    expect(value).toBeInstanceOf(APICallError);
    expect(value.statusCode).toBe(429);
    expect(value.isRetryable).toBe(true);
    expect(value.responseHeaders?.['retry-after']).toBeUndefined();
    expect(value.responseBody).toContain('google.rpc.RetryInfo');
    expect(value.data).toMatchObject({
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
