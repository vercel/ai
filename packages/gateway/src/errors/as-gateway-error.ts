import { APICallError } from '@ai-sdk/provider';
import { createGatewayErrorFromResponse } from './create-gateway-error';
import { extractApiCallResponse } from './extract-api-call-response';
import { GatewayError } from './gateway-error';
import { GatewayTimeoutError } from './gateway-timeout-error';

/**
 * Checks if an error is a timeout error from undici.
 * Only checks undici-specific error codes to avoid false positives.
 */
function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // Check for undici-specific timeout error codes
  const errorCode = (error as any).code;
  if (typeof errorCode === 'string') {
    const undiciTimeoutCodes = [
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_BODY_TIMEOUT',
      'UND_ERR_CONNECT_TIMEOUT',
    ];
    return undiciTimeoutCodes.includes(errorCode);
  }

  return false;
}

export async function asGatewayError(
  error: unknown,
  authMethod?: 'api-key' | 'oidc',
  callerSignal?: AbortSignal,
) {
  // Caller cancellation is not a gateway failure and must not become a retryable 500.
  // When the caller's signal is provided and already aborted, the AbortError/TimeoutError
  // is a genuine user cancellation and must be re-thrown as-is.
  // When no signal is provided (e.g. stream error handlers), preserve existing behaviour.
  // When a signal IS provided but is NOT aborted, the error came from an internal source
  // (e.g. undici connection-pool cleanup) and should be treated as a retryable error.
  if (
    (error instanceof Error ||
      (typeof DOMException === 'function' && error instanceof DOMException)) &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    if (!callerSignal || callerSignal.aborted) {
      throw error;
    }
    // Internal abort (connection pool, etc.) — surface as a retryable gateway error
    // so the AI SDK retry layer can transparently retry the request.
    return new GatewayTimeoutError({
      message: `Gateway connection was reset: ${error instanceof Error ? error.message : 'Unknown error'}`,
      statusCode: 503,
      cause: error,
    });
  }

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
      isRetryable:
        error.isRetryable &&
        (error.statusCode == null || error.statusCode < 400)
          ? true
          : undefined,
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
