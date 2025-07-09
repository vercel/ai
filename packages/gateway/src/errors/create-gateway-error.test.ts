import { describe, expect, it } from 'vitest';
import {
  createGatewayErrorFromResponse,
  GatewayAuthenticationError,
  GatewayInvalidRequestError,
  GatewayRateLimitError,
  GatewayModelNotFoundError,
  GatewayInternalServerError,
  GatewayResponseError,
  type GatewayErrorResponse,
} from './index';

describe('Valid error responses', () => {
  it('should create GatewayAuthenticationError for authentication_error type', () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Invalid API key',
        type: 'authentication_error',
      },
    };

    const error = createGatewayErrorFromResponse({
      response,
      statusCode: 401,
    });

    expect(error).toBeInstanceOf(GatewayAuthenticationError);
    expect(error.message).toContain('No authentication provided');
    expect(error.statusCode).toBe(401);
    expect(error.type).toBe('authentication_error');
  });

  it('should create GatewayInvalidRequestError for invalid_request_error type', () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Missing required parameter',
        type: 'invalid_request_error',
      },
    };

    const error = createGatewayErrorFromResponse({
      response,
      statusCode: 400,
    });

    expect(error).toBeInstanceOf(GatewayInvalidRequestError);
    expect(error.message).toBe('Missing required parameter');
    expect(error.statusCode).toBe(400);
  });

  it('should create GatewayRateLimitError for rate_limit_exceeded type', () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Rate limit exceeded. Try again later.',
        type: 'rate_limit_exceeded',
      },
    };

    const error = createGatewayErrorFromResponse({
      response,
      statusCode: 429,
    });

    expect(error).toBeInstanceOf(GatewayRateLimitError);
    expect(error.message).toBe('Rate limit exceeded. Try again later.');
    expect(error.statusCode).toBe(429);
  });

  it('should create GatewayModelNotFoundError for model_not_found type', () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Model not available',
        type: 'model_not_found',
        param: { modelId: 'gpt-4-turbo' },
      },
    };

    const error = createGatewayErrorFromResponse({
      response,
      statusCode: 404,
    });

    expect(error).toBeInstanceOf(GatewayModelNotFoundError);
    expect(error.message).toBe('Model not available');
    expect(error.statusCode).toBe(404);
    expect((error as GatewayModelNotFoundError).modelId).toBe('gpt-4-turbo');
  });

  it('should create GatewayModelNotFoundError without modelId for invalid param', () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Model not available',
        type: 'model_not_found',
        param: { invalidField: 'value' },
      },
    };

    const error = createGatewayErrorFromResponse({
      response,
      statusCode: 404,
    });

    expect(error).toBeInstanceOf(GatewayModelNotFoundError);
    expect((error as GatewayModelNotFoundError).modelId).toBeUndefined();
  });

  it('should create GatewayInternalServerError for internal_server_error type', () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Internal server error occurred',
        type: 'internal_server_error',
      },
    };

    const error = createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error).toBeInstanceOf(GatewayInternalServerError);
    expect(error.message).toBe('Internal server error occurred');
    expect(error.statusCode).toBe(500);
  });

  it('should create GatewayInternalServerError for unknown error type', () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Unknown error occurred',
        type: 'unknown_error_type',
      },
    };

    const error = createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error).toBeInstanceOf(GatewayInternalServerError);
    expect(error.message).toBe('Unknown error occurred');
    expect(error.statusCode).toBe(500);
  });
});

describe('Error response edge cases', () => {
  it('should preserve empty string messages from Gateway', () => {
    const response: GatewayErrorResponse = {
      error: {
        message: '',
        type: 'authentication_error',
      },
    };

    const error = createGatewayErrorFromResponse({
      response,
      statusCode: 401,
      defaultMessage: 'Custom default message',
    });

    expect(error.message).toContain('No authentication provided'); // Uses contextual message
  });

  it('should use defaultMessage when response message is null', () => {
    const response = {
      error: {
        message: null,
        type: 'authentication_error',
      },
    };

    const error = createGatewayErrorFromResponse({
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

  it('should handle error type as null', () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Some error',
        type: null,
      },
    };

    const error = createGatewayErrorFromResponse({
      response,
      statusCode: 500,
    });

    expect(error).toBeInstanceOf(GatewayInternalServerError);
  });

  it('should include cause in the created error', () => {
    const originalCause = new Error('Original network error');
    const response: GatewayErrorResponse = {
      error: {
        message: 'Gateway timeout',
        type: 'internal_server_error',
      },
    };

    const error = createGatewayErrorFromResponse({
      response,
      statusCode: 504,
      cause: originalCause,
    });

    expect(error.cause).toBe(originalCause);
  });
});

describe('Malformed responses', () => {
  it('should create GatewayResponseError for completely invalid response', () => {
    const response = {
      invalidField: 'value',
    };

    const error = createGatewayErrorFromResponse({
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
    expect(responseError.validationError?.issues).toBeDefined();
  });

  it('should create GatewayResponseError for missing error field', () => {
    const response = {
      data: 'some data',
    };

    const error = createGatewayErrorFromResponse({
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

  it('should create GatewayResponseError for null response', () => {
    const response = null;

    const error = createGatewayErrorFromResponse({
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

  it('should create GatewayResponseError for string response', () => {
    const response = 'Error string';

    const error = createGatewayErrorFromResponse({
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

  it('should create GatewayResponseError for array response', () => {
    const response = ['error', 'array'];

    const error = createGatewayErrorFromResponse({
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
  it('should use default defaultMessage when not provided', () => {
    const response = {
      invalidField: 'value',
    };

    const error = createGatewayErrorFromResponse({
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

  it('should handle undefined cause', () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Test error',
        type: 'authentication_error',
      },
    };

    const error = createGatewayErrorFromResponse({
      response,
      statusCode: 401,
      cause: undefined,
    });

    expect(error.cause).toBeUndefined();
  });
});

describe('Complex scenarios', () => {
  it('should handle model_not_found with missing param field', () => {
    const response: GatewayErrorResponse = {
      error: {
        message: 'Model not found',
        type: 'model_not_found',
        // param field missing
      },
    };

    const error = createGatewayErrorFromResponse({
      response,
      statusCode: 404,
    });

    expect(error).toBeInstanceOf(GatewayModelNotFoundError);
    expect((error as GatewayModelNotFoundError).modelId).toBeUndefined();
  });

  it('should handle response with extra fields', () => {
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

    const error = createGatewayErrorFromResponse({
      response,
      statusCode: 401,
    });

    expect(error).toBeInstanceOf(GatewayAuthenticationError);
    expect(error.message).toContain('No authentication provided');
  });

  it('should preserve error properties correctly', () => {
    const originalCause = new TypeError('Type error');
    const response: GatewayErrorResponse = {
      error: {
        message: 'Rate limit hit',
        type: 'rate_limit_exceeded',
      },
    };

    const error = createGatewayErrorFromResponse({
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

describe('authentication_error with authMethod context', () => {
  it('should create contextual error for API key authentication failure', () => {
    const error = createGatewayErrorFromResponse({
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
    expect(error.message).toContain('Invalid API key provided');
    expect(error.statusCode).toBe(401);
  });

  it('should create contextual error for OIDC authentication failure', () => {
    const error = createGatewayErrorFromResponse({
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
    expect(error.message).toContain('Invalid OIDC token provided');
    expect(error.statusCode).toBe(401);
  });

  it('should create contextual error without authMethod context', () => {
    const error = createGatewayErrorFromResponse({
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
