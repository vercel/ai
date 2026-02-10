import { APICallError } from '@ai-sdk/provider';
import { extractApiCallResponse, GatewayError } from '.';
import { createGatewayErrorFromResponse } from './create-gateway-error';
import { GatewayTimeoutError } from './gateway-timeout-error';

/**
 * Checks if an error is a timeout error (e.g., from undici)
 */
function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // Check for undici timeout errors by name
  const timeoutErrorNames = [
    'HeadersTimeoutError',
    'BodyTimeoutError',
    'ConnectTimeoutError',
  ];
  if (timeoutErrorNames.includes(error.name)) {
    return true;
  }

  // Check for undici-specific error codes
  const errorCode = (error as any).code;
  if (typeof errorCode === 'string') {
    const undiciTimeoutCodes = [
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_BODY_TIMEOUT',
      'UND_ERR_CONNECT_TIMEOUT',
    ];
    if (undiciTimeoutCodes.includes(errorCode)) {
      return true;
    }
  }

  // Check for timeout in error message
  const message = error.message.toLowerCase();
  if (message.includes('timeout') || message.includes('timed out')) {
    return true;
  }

  return false;
}

export async function asGatewayError(
  error: unknown,
  authMethod?: 'api-key' | 'oidc',
) {
  if (GatewayError.isInstance(error)) {
    return error;
  }

  // Check if this is a timeout error (or has a timeout error in the cause chain)
  if (isTimeoutError(error)) {
    return GatewayTimeoutError.createTimeoutError({
      originalMessage: error instanceof Error ? error.message : 'Unknown error',
      cause: error,
    });
  }

  // Check if this is an APICallError caused by a timeout
  if (APICallError.isInstance(error)) {
    // Check if the cause is a timeout error
    if (error.cause && isTimeoutError(error.cause)) {
      return GatewayTimeoutError.createTimeoutError({
        originalMessage: error.message,
        cause: error,
      });
    }

    return await createGatewayErrorFromResponse({
      response: extractApiCallResponse(error),
      statusCode: error.statusCode ?? 500,
      defaultMessage: 'Gateway request failed',
      cause: error,
      authMethod,
    });
  }

  return await createGatewayErrorFromResponse({
    response: {},
    statusCode: 500,
    defaultMessage:
      error instanceof Error
        ? `Gateway request failed: ${error.message}`
        : 'Unknown Gateway error',
    cause: error,
    authMethod,
  });
}
