import { safeParseJSON } from '@ai-sdk/provider-utils';
import {
  assemblyaiErrorDataSchema,
  assemblyaiFailedResponseHandler,
} from './assemblyai-error';
import { describe, it, expect } from 'vitest';

async function handleResponse(response: Response) {
  const { value } = await assemblyaiFailedResponseHandler({
    url: 'https://api.assemblyai.com/v2/transcript',
    requestBodyValues: {},
    response,
  });
  return value;
}

async function handleErrorResponse(
  body: unknown,
  status: number,
  statusText?: string,
) {
  return handleResponse(
    new Response(JSON.stringify(body), { status, statusText }),
  );
}

describe('assemblyaiErrorDataSchema', () => {
  it('should parse AssemblyAI resource exhausted error', async () => {
    const error = `
{"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 429,\\n    \\"message\\": \\"Resource has been exhausted (e.g. check quota).\\",\\n    \\"status\\": \\"RESOURCE_EXHAUSTED\\"\\n  }\\n}\\n","code":429}}
`;

    const result = await safeParseJSON({
      text: error,
      schema: assemblyaiErrorDataSchema,
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

  it('should parse the documented flat error shape', async () => {
    const body = { error: 'Invalid API key' };

    const result = await safeParseJSON({
      text: JSON.stringify(body),
      schema: assemblyaiErrorDataSchema,
    });

    expect(result).toStrictEqual({
      success: true,
      value: body,
      rawValue: body,
    });
  });

  it('should parse the documented flat error shape with a status', async () => {
    const body = { error: 'format_text must be a Boolean', status: 'error' };

    const result = await safeParseJSON({
      text: JSON.stringify(body),
      schema: assemblyaiErrorDataSchema,
    });

    expect(result).toStrictEqual({
      success: true,
      // The schema strips unknown keys such as `status`.
      value: { error: 'format_text must be a Boolean' },
      rawValue: body,
    });
  });

  it('should parse the flat error shape with an unexpected status value', async () => {
    const body = { error: 'Invalid API key', status: 'unexpected' };

    const result = await safeParseJSON({
      text: JSON.stringify(body),
      schema: assemblyaiErrorDataSchema,
    });

    expect(result).toStrictEqual({
      success: true,
      value: { error: 'Invalid API key' },
      rawValue: body,
    });
  });
});

describe('assemblyaiFailedResponseHandler', () => {
  it('should use the flat error message', async () => {
    const body = { error: 'Invalid API key' };

    const error = await handleErrorResponse(body, 401);

    expect(error.message).toBe('Invalid API key');
    expect(error.statusCode).toBe(401);
    expect(error.data).toStrictEqual(body);
  });

  it('should use the flat error message with a status', async () => {
    const body = { error: 'format_text must be a Boolean', status: 'error' };

    const error = await handleErrorResponse(body, 400);

    expect(error.message).toBe('format_text must be a Boolean');
    expect(error.statusCode).toBe(400);
    // The schema strips unknown keys such as `status`.
    expect(error.data).toStrictEqual({
      error: 'format_text must be a Boolean',
    });
  });

  it('should keep using the nested error message', async () => {
    const body = {
      error: {
        message:
          '{\n  "error": {\n    "code": 429,\n    "message": "Resource has been exhausted (e.g. check quota).",\n    "status": "RESOURCE_EXHAUSTED"\n  }\n}\n',
        code: 429,
      },
    };

    const error = await handleErrorResponse(body, 429);

    expect(error.message).toBe(body.error.message);
    expect(error.statusCode).toBe(429);
    expect(error.data).toStrictEqual(body);
  });

  it('should fall back to the status text for an unrecognized error body', async () => {
    const error = await handleErrorResponse(
      { foo: 'bar' },
      500,
      'Internal Server Error',
    );

    expect(error.message).toBe('Internal Server Error');
    expect(error.statusCode).toBe(500);
    expect(error.responseBody).toBe('{"foo":"bar"}');
  });

  it('should fall back to the status text for a non-JSON error body', async () => {
    const error = await handleResponse(
      new Response('not json', { status: 502, statusText: 'Bad Gateway' }),
    );

    expect(error.message).toBe('Bad Gateway');
    expect(error.statusCode).toBe(502);
    expect(error.responseBody).toBe('not json');
  });
});
