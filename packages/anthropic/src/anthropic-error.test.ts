import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { anthropicErrorDataSchema } from './anthropic-error';
import { describe, it, expect } from 'vitest';

describe('anthropicError', () => {
  describe('anthropicErrorDataSchema', () => {
    it.each([
      { error_code: 'thread_not_found', unsupported: [{ future: true }] },
      { error_code: 'thread_not_found', unknown_field: 'future' },
      'future details shape',
    ])('keeps the error message when details evolve: %j', async details => {
      const result = await safeValidateTypes({
        value: {
          type: 'error',
          error: {
            type: 'not_found_error',
            message: 'Thread not found',
            details,
          },
        },
        schema: anthropicErrorDataSchema,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.error.message).toBe('Thread not found');
        if (typeof details === 'object') {
          expect(result.value.error.details?.error_code).toBe(
            'thread_not_found',
          );
        }
      }
    });

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
              "details": null,
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
