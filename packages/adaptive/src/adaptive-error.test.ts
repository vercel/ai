import { describe, it, expect } from 'vitest';
import { adaptiveErrorDataSchema } from './adaptive-error';
import { safeParseJSON } from '@ai-sdk/provider-utils';

describe('adaptiveErrorDataSchema', () => {
  it('should parse a standard error response', async () => {
    const error = JSON.stringify({
      error: { message: 'Something went wrong', code: 400 },
    });
    const result = await safeParseJSON({
      text: error,
      schema: adaptiveErrorDataSchema,
    });
    if (!result.success) throw result.error;
    expect(result.value.error.message).toBe('Something went wrong');
    expect(result.value.error.code).toBe(400);
  });

  it('should parse an error response with only a message', async () => {
    const error = JSON.stringify({ error: { message: 'Just a message' } });
    const result = await safeParseJSON({
      text: error,
      schema: adaptiveErrorDataSchema,
    });
    if (!result.success) throw result.error;
    expect(result.value.error.message).toBe('Just a message');
  });
});
