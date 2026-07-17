import { safeParseJSON } from '@ai-sdk/provider-utils';
import { speechifyErrorDataSchema } from './speechify-error';
import { describe, it, expect } from 'vitest';

describe('speechifyErrorDataSchema', () => {
  it('should parse a Speechify validation error', async () => {
    const error = `{"error":{"code":"validation_failed","message":"voice_id is required"},"request_id":"req_123"}`;

    const result = await safeParseJSON({
      text: error,
      schema: speechifyErrorDataSchema,
    });

    expect(result).toStrictEqual({
      success: true,
      value: {
        error: {
          code: 'validation_failed',
          message: 'voice_id is required',
        },
        request_id: 'req_123',
      },
      rawValue: {
        error: {
          code: 'validation_failed',
          message: 'voice_id is required',
        },
        request_id: 'req_123',
      },
    });
  });

  it('should parse an error without a code or request_id', async () => {
    const error = `{"error":{"message":"Internal server error"}}`;

    const result = await safeParseJSON({
      text: error,
      schema: speechifyErrorDataSchema,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.error.message).toBe('Internal server error');
    }
  });
});
