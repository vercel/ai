import { anthropicErrorDataSchema } from './anthropic-error';

describe('anthropicError', () => {
  describe('anthropicErrorDataSchema', () => {
    it('should parse overloaded error', async () => {
      const result = anthropicErrorDataSchema.safeParse({
        type: 'error',
        error: {
          details: null,
          type: 'overloaded_error',
          message: 'Overloaded',
        },
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "data": {
            "error": {
              "message": "Overloaded",
              "type": "overloaded_error",
            },
            "type": "error",
          },
          "success": true,
        }
      `);
    });
  });
});
