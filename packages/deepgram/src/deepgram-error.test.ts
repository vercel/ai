import { safeParseJSON } from '@ai-sdk/provider-utils';
import { deepgramErrorDataSchema } from './deepgram-error';
import { describe, expect, it } from 'vitest';

describe('deepgramErrorDataSchema', () => {
  it('should parse the err_code/err_msg error shape', async () => {
    const error = `{"err_code":"INVALID_QUERY_PARAMETER","err_msg":"Invalid 'model' value of 'aura-2-not-a-real-voice-en'.","request_id":"01a00450-5a52-70f0-9253-2fc492123595"}`;

    const result = await safeParseJSON({
      text: error,
      schema: deepgramErrorDataSchema,
    });

    expect(result).toStrictEqual({
      success: true,
      value: {
        err_code: 'INVALID_QUERY_PARAMETER',
        err_msg: "Invalid 'model' value of 'aura-2-not-a-real-voice-en'.",
        request_id: '01a00450-5a52-70f0-9253-2fc492123595',
      },
      rawValue: {
        err_code: 'INVALID_QUERY_PARAMETER',
        err_msg: "Invalid 'model' value of 'aura-2-not-a-real-voice-en'.",
        request_id: '01a00450-5a52-70f0-9253-2fc492123595',
      },
    });
  });

  it('should parse an auth error without relying on optional fields', async () => {
    const error = `{"err_code":"INVALID_AUTH","err_msg":"Invalid credentials."}`;

    const result = await safeParseJSON({
      text: error,
      schema: deepgramErrorDataSchema,
    });

    expect(result).toStrictEqual({
      success: true,
      value: {
        err_code: 'INVALID_AUTH',
        err_msg: 'Invalid credentials.',
      },
      rawValue: {
        err_code: 'INVALID_AUTH',
        err_msg: 'Invalid credentials.',
      },
    });
  });
});
