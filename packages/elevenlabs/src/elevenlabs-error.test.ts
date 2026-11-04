import { safeParseJSON } from '@ai-sdk/provider-utils';
import {
  elevenlabsErrorDataSchema,
  elevenlabsFailedResponseHandler,
} from './elevenlabs-error';
import { describe, it, expect } from 'vitest';

async function handleErrorResponse(body: unknown, status: number) {
  const { value } = await elevenlabsFailedResponseHandler({
    url: 'https://api.elevenlabs.io/v1/text-to-speech/test-voice',
    requestBodyValues: {},
    response: new Response(JSON.stringify(body), { status }),
  });
  return value;
}

describe('elevenlabsErrorDataSchema', () => {
  it('should parse ElevenLabs resource exhausted error', async () => {
    const error = `
{"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 429,\\n    \\"message\\": \\"Resource has been exhausted (e.g. check quota).\\",\\n    \\"status\\": \\"RESOURCE_EXHAUSTED\\"\\n  }\\n}\\n","code":429}}
`;

    const result = await safeParseJSON({
      text: error,
      schema: elevenlabsErrorDataSchema,
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

  it('should keep the request id of an object detail in the parsed data', async () => {
    const body = {
      detail: {
        type: 'authentication_error',
        code: 'invalid_api_key',
        message: 'API key must be exactly 51 characters, got 6.',
        status: 'invalid_api_key_length',
        request_id: 'req_test_401',
        param: 'api_key',
      },
    };

    const result = await safeParseJSON({
      text: JSON.stringify(body),
      schema: elevenlabsErrorDataSchema,
    });

    expect(result).toStrictEqual({
      success: true,
      value: body,
      rawValue: body,
    });
  });
});

describe('elevenlabsFailedResponseHandler', () => {
  it('should use the message and code of an object detail', async () => {
    const body = {
      detail: {
        type: 'not_found',
        code: 'voice_not_found',
        message: "A voice with voice_id 'x' was not found.",
        status: 'voice_not_found',
        request_id: 'req_test_404',
      },
    };

    const error = await handleErrorResponse(body, 404);

    expect(error.message).toBe(
      "A voice with voice_id 'x' was not found. (voice_not_found)",
    );
    expect(error.statusCode).toBe(404);
    expect(error.data).toStrictEqual(body);
  });

  it('should use the message of an object detail without a code', async () => {
    const error = await handleErrorResponse(
      {
        detail: {
          code: null,
          status: 'invalid_content',
          message: 'File is corrupted. Please ensure it is playable audio.',
          param: null,
        },
      },
      400,
    );

    expect(error.message).toBe(
      'File is corrupted. Please ensure it is playable audio.',
    );
  });

  it('should join the location and message of each array detail issue', async () => {
    const body = {
      detail: [
        {
          type: 'missing',
          loc: ['body', 'text'],
          msg: 'Field required',
          input: null,
        },
        {
          type: 'less_than_equal',
          loc: ['body', 'voice_settings', 'stability', 0],
          msg: 'Input should be less than or equal to 1',
        },
        { msg: 'Request is invalid' },
      ],
    };

    const error = await handleErrorResponse(body, 422);

    expect(error.message).toBe(
      'body.text: Field required; body.voice_settings.stability.0: Input should be less than or equal to 1; Request is invalid',
    );
    expect(error.data).toStrictEqual(body);
  });

  it('should use a string detail', async () => {
    const error = await handleErrorResponse(
      { detail: 'Not authenticated' },
      401,
    );

    expect(error.message).toBe('Not authenticated');
    expect(error.data).toStrictEqual({ detail: 'Not authenticated' });
  });

  it('should use the message of a legacy error object', async () => {
    const body = { error: { message: 'Quota exceeded', code: 429 } };

    const error = await handleErrorResponse(body, 429);

    expect(error.message).toBe('Quota exceeded');
    expect(error.data).toStrictEqual(body);
  });
});
