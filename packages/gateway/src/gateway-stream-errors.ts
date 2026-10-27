import { getErrorMessage } from '@ai-sdk/provider';
import { asGatewayError, createGatewayErrorFromResponse } from './errors';

/**
 * `asGatewayError` is async while the WebSocket event handlers are
 * synchronous, hence this helper.
 */
export async function errorControllerWithGatewayError<PART>(
  controller: ReadableStreamDefaultController<PART>,
  error: unknown,
  authMethod: 'api-key' | 'oidc' | undefined,
): Promise<void> {
  controller.error(await asGatewayError(error, authMethod));
}

/**
 * Extract a human-readable message from an `error` stream part's payload for
 * the terminal close error.
 */
function getServerErrorMessage(error: unknown): string {
  if (
    error != null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  // JSON-stringifies object payloads (`String` would yield '[object Object]').
  return getErrorMessage(error);
}

/** Canonical status codes for server error-part types (no HTTP status exists on the WebSocket). */
const SERVER_ERROR_STATUS_CODES: Record<string, number> = {
  authentication_error: 401,
  failed_dependency: 424,
  forbidden: 403,
  internal_server_error: 500,
  invalid_request_error: 400,
  model_not_found: 404,
  rate_limit_exceeded: 429,
};

/**
 * Maps a server error-part payload (`{ message, type }`) to the public
 * Gateway error class for its type; unknown shapes keep the generic message.
 */
export async function createErrorFromServerErrorPart(
  error: unknown,
  authMethod: 'api-key' | 'oidc' | undefined,
  streamLabel = 'transcription',
): Promise<unknown> {
  if (
    typeof error === 'object' &&
    error != null &&
    'message' in error &&
    typeof error.message === 'string' &&
    'type' in error &&
    typeof error.type === 'string' &&
    error.type in SERVER_ERROR_STATUS_CODES
  ) {
    return createGatewayErrorFromResponse({
      response: { error: { message: error.message, type: error.type } },
      statusCode: SERVER_ERROR_STATUS_CODES[error.type],
      authMethod,
    });
  }
  return new Error(
    `AI Gateway ${streamLabel} stream failed: ${getServerErrorMessage(error)}`,
  );
}
