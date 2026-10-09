import { safeValidateTypes } from '@ai-sdk/provider-utils';
import {
  anthropicErrorDataSchema,
  anthropicFailedResponseHandler,
} from './anthropic-error';
import { describe, it, expect } from 'vitest';

describe('anthropicError', () => {
  describe('anthropicErrorDataSchema', () => {
    it('should parse overloaded error', async () => {
      const result = await safeValidateTypes({
        value: {
          type: 'error',
          error: {
            details: null,
            type: 'overloaded_error',
            message: 'Overloaded',
          },
        },
        schema: anthropicErrorDataSchema,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "rawValue": {
            "error": {
              "details": null,
              "message": "Overloaded",
              "type": "overloaded_error",
            },
            "type": "error",
          },
          "success": true,
          "value": {
            "error": {
              "message": "Overloaded",
              "type": "overloaded_error",
            },
            "type": "error",
          },
        }
      `);
    });
  });
});

describe('anthropicFailedResponseHandler', () => {
  const call = (error: { type: string; message: string }) =>
    anthropicFailedResponseHandler({
      url: 'https://api.anthropic.com/v1/messages',
      requestBodyValues: {},
      response: new Response(JSON.stringify({ type: 'error', error }), {
        status: 400,
      }),
    });

  it.each([
    'prompt is too long: 215000 tokens > 200000 maximum',
    'input length and `max_tokens` exceed context limit: 198000 + 8192 > 200000, decrease input length or `max_tokens` and try again',
    // Amazon Bedrock's Anthropic transport rewrites Bedrock errors into this shape.
    'Input is too long for requested model.',
  ])('flags context window errors: %s', async message => {
    const { value } = await call({ type: 'invalid_request_error', message });

    expect(value.reason).toBe('context-length-exceeded');
  });

  it('does not flag other invalid request errors', async () => {
    const { value } = await call({
      type: 'invalid_request_error',
      message:
        'max_tokens: 64000 > 32000, which is the maximum allowed number of output tokens for claude-opus-4-20250514',
    });

    expect(value.reason).toBeUndefined();
  });
});
