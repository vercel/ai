import { safeParseJSON } from '@ai-sdk/provider-utils';
import {
  openaiErrorDataSchema,
  openaiFailedResponseHandler,
} from './openai-error';
import { describe, it, expect } from 'vitest';

describe('openaiErrorDataSchema', () => {
  it('should parse OpenRouter resource exhausted error', async () => {
    const error = `
{"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 429,\\n    \\"message\\": \\"Resource has been exhausted (e.g. check quota).\\",\\n    \\"status\\": \\"RESOURCE_EXHAUSTED\\"\\n  }\\n}\\n","code":429}}
`;

    const result = await safeParseJSON({
      text: error,
      schema: openaiErrorDataSchema,
    });

    expect(result).toStrictEqual({
      success: true,
      value: {
        error: {
          message:
            '{\n  "error": {\n    "code": 429,\n    "message": "Resource has been exhausted (e.g. check quota).",\n    "status": "RESOURCE_EXHAUSTED"\n  }\n}\n',
          code: 429,
        },
      },
      rawValue: {
        error: {
          message:
            '{\n  "error": {\n    "code": 429,\n    "message": "Resource has been exhausted (e.g. check quota).",\n    "status": "RESOURCE_EXHAUSTED"\n  }\n}\n',
          code: 429,
        },
      },
    });
  });
});

describe('openaiFailedResponseHandler', () => {
  const call = (error: Record<string, unknown>) =>
    openaiFailedResponseHandler({
      url: 'https://api.openai.com/v1/responses',
      requestBodyValues: {},
      response: new Response(JSON.stringify({ error }), { status: 400 }),
    });

  it('flags context_length_exceeded errors', async () => {
    const { value } = await call({
      message:
        'Your input exceeds the context window of this model. Please adjust your input and try again.',
      type: 'invalid_request_error',
      param: 'input',
      code: 'context_length_exceeded',
    });

    expect(value.reason).toBe('context-length-exceeded');
  });

  it('does not flag other invalid request errors', async () => {
    const { value } = await call({
      message: "Invalid value for 'temperature'.",
      type: 'invalid_request_error',
      param: 'temperature',
      code: 'invalid_value',
    });

    expect(value.reason).toBeUndefined();
  });
});
