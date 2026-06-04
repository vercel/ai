import { describe, expect, it } from 'vitest';
import {
  createGatewayErrorFromResponse,
  GatewayAuthenticationError,
  GatewayInvalidRequestError,
  GatewayRateLimitError,
  GatewayModelNotFoundError,
  GatewayInternalServerError,
  GatewayResponseError,
  GatewayTimeoutError,
  type GatewayErrorResponse,
} from './index';
describe('Valid error responses', () => {
  it('should create GatewayAuthenticationError for authentication_error type', async () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Invalid API key',
        type: 'authentication_error',
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 401,
    });

    expect(error).toBeInstanceOf(GatewayAuthenticationError);
    expect(error.message).toContain('No authentication provided');
    expect(error.statusCode).toBe(401);
    expect(error.type).toBe('authentication_error');
  });

  it('should create GatewayInvalidRequestError for invalid_request_error type', async () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Missing required parameter',
        type: 'invalid_request_error',
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 400,
    });

    expect(error).toBeInstanceOf(GatewayInvalidRequestError);
    expect(error.message).toBe('Missing required parameter');
    expect(error.statusCode).toBe(400);
  });

  it('should create GatewayRateLimitError for rate_limit_exceeded type', async () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Rate limit exceeded. Try again later.',
        type: 'rate_limit_exceeded',
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 429,
    });

    expect(error).toBeInstanceOf(GatewayRateLimitError);
    expect(error.message).toBe('Rate limit exceeded. Try again later.');
    expect(error.statusCode).toBe(429);
  });

  it('should create GatewayModelNotFoundError for model_not_found type', async () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Model not available',
        type: 'model_not_found',
        param: { modelId: 'gpt-ai-sdk-test' }, // Not a real model, just for testing.
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 404,
    });

    expect(error).toBeInstanceOf(GatewayModelNotFoundError);
    expect(error.message).toBe('Model not available');
    expect(error.statusCode).toBe(404);
    expect((error as GatewayModelNotFoundError).modelId).toBe(
      'gpt-ai-sdk-test',
    );
  });

  it('should create GatewayModelNotFoundError without modelId for invalid param', async () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Model not available',
        type: 'model_not_found',
        param: { invalidField: 'value' },
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 404,
    });

    expect(error).toBeInstanceOf(GatewayModelNotFoundError);
    expect((error as GatewayModelNotFoundError).modelId).toBeUndefined();
  });

  it('should create GatewayInternalServerError for internal_server_error type', async () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Internal server error occurred',
        type: 'internal_server_error',
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error).toBeInstanceOf(GatewayInternalServerError);
    expect(error.message).toBe('Internal server error occurred');
    expect(error.statusCode).toBe(500);
  });

  it('should create GatewayInternalServerError for unknown error type', async () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Unknown error occurred',
        type: 'unknown_error_type',
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error).toBeInstanceOf(GatewayInternalServerError);
    expect(error.message).toBe('Unknown error occurred');
    expect(error.statusCode).toBe(500);
  });

  it('should create GatewayTimeoutError for timeout type', async () => {
    const error = await createGatewayErrorFromResponse({
      response: { error: { message: 'Request timed out', type: 'timeout' } },
      statusCode: 504,
    });

    expect(error).toBeInstanceOf(GatewayTimeoutError);
    expect(error.statusCode).toBe(504);
  });
});

// When the Gateway sends an error type the client doesn't have an explicit
// case for (e.g. a relayed provider error surfaced as "AI_APICallError", or a
// newer Gateway type), classify by HTTP status code instead of collapsing
// everything to GatewayInternalServerError. This keeps `instanceof` checks and
// `isRetryable` meaningful for the most common error category.
describe('status-code fallback for unrecognized error types', () => {
  it('should map a relayed provider 400 (AI_APICallError) to GatewayInvalidRequestError', async () => {
    const error = await createGatewayErrorFromResponse({
      response: {
        error: {
          message:
            'No tool call found for function call output with call_id call_x.',
          type: 'AI_APICallError',
        },
      },
      statusCode: 400,
    });

    expect(error).toBeInstanceOf(GatewayInvalidRequestError);
    expect(error.statusCode).toBe(400);
    expect(error.isRetryable).toBe(false);
  });

  it('should map an unrecognized 429 to GatewayRateLimitError (retryable)', async () => {
    const error = await createGatewayErrorFromResponse({
      response: { error: { message: 'slow down', type: 'AI_APICallError' } },
      statusCode: 429,
    });

    expect(error).toBeInstanceOf(GatewayRateLimitError);
    expect(error.isRetryable).toBe(true);
  });

  it('should map an unrecognized 408/504 to GatewayTimeoutError', async () => {
    const error408 = await createGatewayErrorFromResponse({
      response: { error: { message: 'timed out', type: 'AI_APICallError' } },
      statusCode: 408,
    });
    const error504 = await createGatewayErrorFromResponse({
      response: { error: { message: 'gateway timeout', type: 'some_type' } },
      statusCode: 504,
    });

    expect(error408).toBeInstanceOf(GatewayTimeoutError);
    expect(error504).toBeInstanceOf(GatewayTimeoutError);
  });

  it('should map an unrecognized 5xx to GatewayInternalServerError (retryable)', async () => {
    const error = await createGatewayErrorFromResponse({
      response: {
        error: { message: 'upstream boom', type: 'AI_APICallError' },
      },
      statusCode: 503,
    });

    expect(error).toBeInstanceOf(GatewayInternalServerError);
    expect(error.isRetryable).toBe(true);
  });

  it('should map other unrecognized 4xx to GatewayInvalidRequestError (not retryable)', async () => {
    const error = await createGatewayErrorFromResponse({
      response: {
        error: { message: 'unprocessable', type: 'AI_APICallError' },
      },
      statusCode: 422,
    });

    expect(error).toBeInstanceOf(GatewayInvalidRequestError);
    expect(error.isRetryable).toBe(false);
  });

  // Deliberate: a relayed provider 401/403/404 is bucketed as
  // GatewayInvalidRequestError, NOT GatewayAuthenticationError /
  // GatewayModelNotFoundError. Those classes describe Gateway-level auth and
  // model resolution; the Gateway already emits the matching recognized types
  // (authentication_error / model_not_found) for genuine cases via its own
  // paths. Inferring them from a bare upstream status would mislead (a provider
  // 401 isn't the caller's Gateway key being wrong). isRetryable stays correct
  // either way since it derives from the status code.
  it.each([401, 403, 404])(
    'maps an unrecognized %i to GatewayInvalidRequestError (not Auth/ModelNotFound)',
    async statusCode => {
      const error = await createGatewayErrorFromResponse({
        response: {
          error: { message: 'upstream rejected', type: 'AI_APICallError' },
        },
        statusCode,
      });

      expect(error).toBeInstanceOf(GatewayInvalidRequestError);
      expect(error.statusCode).toBe(statusCode);
      expect(error.isRetryable).toBe(false);
    },
  );
});

describe('Error response edge cases', () => {
  it('should preserve empty string messages from Gateway', async () => {
    const response: GatewayErrorResponse = {
      error: {
        message: '',
        type: 'authentication_error',
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 401,
      defaultMessage: 'Custom default message',
    });

    expect(error.message).toContain('No authentication provided'); // Uses contextual message
  });

  it('should use defaultMessage when response message is null', async () => {
    const response = {
      error: {
        message: null,
        type: 'authentication_error',
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 401,
      defaultMessage: 'Custom default message',
    });

    // When the response doesn't pass schema validation, it creates a response error
    expect(error).toBeInstanceOf(GatewayResponseError);
    expect(error.message).toBe(
      'Invalid error response format: Custom default message',
    );

    // Verify debugging information is included
    const responseError = error as GatewayResponseError;
    expect(responseError.response).toBe(response);
    expect(responseError.validationError).toBeDefined();
  });

  it('should handle error type as null', async () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Some error',
        type: null,
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error).toBeInstanceOf(GatewayInternalServerError);
  });

  it('should include cause in the created error', async () => {
    const originalCause = new Error('Original network error');
    const response: GatewayErrorResponse = {
      error: {
        message: 'Gateway timeout',
        type: 'internal_server_error',
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 504,
      cause: originalCause,
    });

    expect(error.cause).toBe(originalCause);
  });
});

describe('Malformed responses', () => {
  it('should create GatewayResponseError for completely invalid response', async () => {
    const response = {
      invalidField: 'value',
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error).toBeInstanceOf(GatewayResponseError);
    expect(error.message).toBe(
      'Invalid error response format: Gateway request failed',
    );
    expect(error.statusCode).toBe(500);

    // Verify debugging information is included
    const responseError = error as GatewayResponseError;
    expect(responseError.response).toBe(response);
    expect(responseError.validationError).toBeDefined();
  });

  it('should create GatewayResponseError for missing error field', async () => {
    const response = {
      data: 'some data',
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 500,
      defaultMessage: 'Custom error message',
    });

    expect(error).toBeInstanceOf(GatewayResponseError);
    expect(error.message).toBe(
      'Invalid error response format: Custom error message',
    );

    // Verify debugging information is included
    const responseError = error as GatewayResponseError;
    expect(responseError.response).toBe(response);
    expect(responseError.validationError).toBeDefined();
  });

  it('should create GatewayResponseError for null response', async () => {
    const response = null;

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error).toBeInstanceOf(GatewayResponseError);
    expect(error.message).toBe(
      'Invalid error response format: Gateway request failed',
    );

    // Verify debugging information is included
    const responseError = error as GatewayResponseError;
    expect(responseError.response).toBe(response);
    expect(responseError.validationError).toBeDefined();
  });

  it('should create GatewayResponseError for string response', async () => {
    const response = 'Error string';

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error).toBeInstanceOf(GatewayResponseError);
    expect(error.message).toBe(
      'Invalid error response format: Gateway request failed',
    );

    // Verify debugging information is included
    const responseError = error as GatewayResponseError;
    expect(responseError.response).toBe(response);
    expect(responseError.validationError).toBeDefined();
  });

  it('should create GatewayResponseError for array response', async () => {
    const response = ['error', 'array'];

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error).toBeInstanceOf(GatewayResponseError);
    expect(error.message).toBe(
      'Invalid error response format: Gateway request failed',
    );

    // Verify debugging information is included
    const responseError = error as GatewayResponseError;
    expect(responseError.response).toBe(response);
    expect(responseError.validationError).toBeDefined();
  });
});

describe('Object parameter validation', () => {
  it('should use default defaultMessage when not provided', async () => {
    const response = {
      invalidField: 'value',
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error).toBeInstanceOf(GatewayResponseError);
    expect(error.message).toBe(
      'Invalid error response format: Gateway request failed',
    );

    // Verify debugging information is included
    const responseError = error as GatewayResponseError;
    expect(responseError.response).toBe(response);
    expect(responseError.validationError).toBeDefined();
  });

  it('should handle undefined cause', async () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Test error',
        type: 'authentication_error',
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 401,
      cause: undefined,
    });

    expect(error.cause).toBeUndefined();
  });
});

describe('Complex scenarios', () => {
  it('should handle model_not_found with missing param field', async () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Model not found',
        type: 'model_not_found',
        // param field missing
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 404,
    });

    expect(error).toBeInstanceOf(GatewayModelNotFoundError);
    expect((error as GatewayModelNotFoundError).modelId).toBeUndefined();
  });

  it('should handle response with extra fields', async () => {
    const response = {
      error: {
        message: 'Test error',
        type: 'authentication_error',
        code: 'AUTH_FAILED',
        param: null,
        extraField: 'should be ignored',
      },
      metadata: 'should be ignored',
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 401,
    });

    expect(error).toBeInstanceOf(GatewayAuthenticationError);
    expect(error.message).toContain('No authentication provided');
  });

  it('should preserve error properties correctly', async () => {
    const originalCause = new TypeError('Type error');
    const response: GatewayErrorResponse = {
      error: {
        message: 'Rate limit hit',
        type: 'rate_limit_exceeded',
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 429,
      defaultMessage: 'Fallback message',
      cause: originalCause,
    });

    expect(error).toBeInstanceOf(GatewayRateLimitError);
    expect(error.message).toBe('Rate limit hit'); // Uses response message, not default
    expect(error.statusCode).toBe(429);
    expect(error.cause).toBe(originalCause);
    expect(error.name).toBe('GatewayRateLimitError');
    expect(error.type).toBe('rate_limit_exceeded');
  });
});

describe('generationId support', () => {
  it('should include generationId in error when present in response', async () => {
    const response = {
      error: {
        message: 'Internal server error',
        type: 'internal_server_error',
      },
      generationId: 'gen_01ABC123XYZ',
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error).toBeInstanceOf(GatewayInternalServerError);
    expect(error.generationId).toBe('gen_01ABC123XYZ');
  });

  it('should include generationId in authentication error', async () => {
    const response = {
      error: {
        message: 'Invalid API key',
        type: 'authentication_error',
      },
      generationId: 'gen_01AUTH456',
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 401,
      authMethod: 'api-key',
    });

    expect(error).toBeInstanceOf(GatewayAuthenticationError);
    expect(error.generationId).toBe('gen_01AUTH456');
  });

  it('should include generationId in rate limit error', async () => {
    const response = {
      error: {
        message: 'Rate limit exceeded',
        type: 'rate_limit_exceeded',
      },
      generationId: 'gen_01RATE789',
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 429,
    });

    expect(error).toBeInstanceOf(GatewayRateLimitError);
    expect(error.generationId).toBe('gen_01RATE789');
  });

  it('should include generationId in model not found error', async () => {
    const response = {
      error: {
        message: 'Model not found',
        type: 'model_not_found',
        param: { modelId: 'gpt-5' },
      },
      generationId: 'gen_01MODEL000',
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 404,
    });

    expect(error).toBeInstanceOf(GatewayModelNotFoundError);
    expect(error.generationId).toBe('gen_01MODEL000');
  });

  it('should have undefined generationId when not present in response', async () => {
    const response = {
      error: {
        message: 'Some error',
        type: 'internal_server_error',
      },
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error.generationId).toBeUndefined();
  });

  it('should extract generationId from malformed response when possible', async () => {
    const response = {
      invalidField: 'value',
      generationId: 'gen_01MALFORMED',
    };

    const error = await createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error).toBeInstanceOf(GatewayResponseError);
    expect(error.generationId).toBe('gen_01MALFORMED');
  });
});

describe('authentication_error with authMethod context', () => {
  it('should create contextual error for API key authentication failure', async () => {
    const error = await createGatewayErrorFromResponse({
      response: {
        error: {
          type: 'authentication_error',
          message: 'Invalid API key',
        },
      },
      statusCode: 401,
      authMethod: 'api-key',
    });

    expect(error).toBeInstanceOf(GatewayAuthenticationError);
    expect(error.message).toContain('Invalid API key');
    expect(error.message).toContain('vercel.com/d?to=');
    expect(error.statusCode).toBe(401);
  });

  it('should create contextual error for OIDC authentication failure', async () => {
    const error = await createGatewayErrorFromResponse({
      response: {
        error: {
          type: 'authentication_error',
          message: 'Invalid OIDC token',
        },
      },
      statusCode: 401,
      authMethod: 'oidc',
    });

    expect(error).toBeInstanceOf(GatewayAuthenticationError);
    expect(error.message).toContain('Invalid OIDC token');
    expect(error.message).toContain('npx vercel link');
    expect(error.statusCode).toBe(401);
  });

  it('should create contextual error without authMethod context', async () => {
    const error = await createGatewayErrorFromResponse({
      response: {
        error: {
          type: 'authentication_error',
          message: 'Authentication failed',
        },
      },
      statusCode: 401,
    });

    expect(error).toBeInstanceOf(GatewayAuthenticationError);
    expect(error.message).toContain('No authentication provided');
    expect(error.statusCode).toBe(401);
  });
});
