import { describe, expect, it } from 'vitest';
import { groqFailedResponseHandler } from './groq-error';

describe('groqFailedResponseHandler', () => {
  const call = async (type: string, code?: string) =>
    (
      await groqFailedResponseHandler({
        url: 'https://api.groq.com/openai/v1/chat/completions',
        requestBodyValues: {},
        response: new Response(
          JSON.stringify({
            error: { message: 'Request rejected.', type, code },
          }),
          { status: 400 },
        ),
      })
    ).value;

  it.each([
    ['type', 'context_length_exceeded', undefined],
    ['code', 'invalid_request_error', 'context_length_exceeded'],
  ])('flags context_length_exceeded in the %s', async (_field, type, code) => {
    expect((await call(type, code)).failureReason).toBe(
      'context-length-exceeded',
    );
  });

  it('does not flag other errors', async () => {
    expect((await call('invalid_request_error')).failureReason).toBeUndefined();
  });
});
