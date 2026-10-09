import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { googleFailedResponseHandler } from './google-error';

describe('googleFailedResponseHandler', () => {
  it('preserves google.rpc.RetryInfo in APICallError.data', async () => {
    const responseBody = fs.readFileSync(
      'src/__fixtures__/google-429-retry-info.json',
      'utf8',
    );

    const result = await googleFailedResponseHandler({
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      requestBodyValues: { contents: [] },
      response: new Response(responseBody, {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    });

    expect(result.value.data).toMatchObject({
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

describe('googleFailedResponseHandler failureReason', () => {
  const call = (message: string) =>
    googleFailedResponseHandler({
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      requestBodyValues: { contents: [] },
      response: new Response(
        JSON.stringify({
          error: { code: 400, message, status: 'INVALID_ARGUMENT' },
        }),
        { status: 400 },
      ),
    });

  it('flags input token limit errors', async () => {
    const { value } = await call(
      'The input token count exceeds the maximum number of tokens allowed 1048576.',
    );

    expect(value.failureReason).toBe('context-length-exceeded');
  });

  it('does not flag other invalid argument errors', async () => {
    const { value } = await call('Request contains an invalid argument.');

    expect(value.failureReason).toBeUndefined();
  });
});
