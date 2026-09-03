import { safeParseJSON } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { fishAudioErrorDataSchema } from './fish-audio-error';

describe('fishAudioErrorDataSchema', () => {
  it('should parse a Fish Audio error', async () => {
    const error = JSON.stringify({
      status: 401,
      message: 'No permission -- see authorization schemes',
    });

    const result = await safeParseJSON({
      text: error,
      schema: fishAudioErrorDataSchema,
    });

    expect(result).toStrictEqual({
      success: true,
      value: {
        status: 401,
        message: 'No permission -- see authorization schemes',
      },
      rawValue: {
        status: 401,
        message: 'No permission -- see authorization schemes',
      },
    });
  });

  it('should tolerate a payload without a message', async () => {
    const result = await safeParseJSON({
      text: JSON.stringify({ status: 402 }),
      schema: fishAudioErrorDataSchema,
    });

    expect(result.success).toBe(true);
  });
});
