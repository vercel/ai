import { describe, expect, it } from 'vitest';
import { APICallError } from './api-call-error';

describe('APICallError', () => {
  it('serializes object-like runtime messages instead of [object Object]', () => {
    const error = new APICallError({
      message: {
        error: {
          code: 503,
          message: 'Service temporarily unavailable',
        },
      },
      url: 'https://gateway.example.test/v1/responses',
      requestBodyValues: {},
      statusCode: 503,
    });

    expect(error.message).toBe(
      JSON.stringify({
        error: {
          code: 503,
          message: 'Service temporarily unavailable',
        },
      }),
    );
    expect(error.message).not.toBe('[object Object]');
  });
});
