import { APICallError } from '@ai-sdk/provider';
import { isAbortError } from './is-abort-error';

const FETCH_FAILED_ERROR_MESSAGES = ['fetch failed', 'failed to fetch'];

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'ConnectionRefused',
  'ConnectionClosed',
  'FailedToOpenSocket',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function findNetworkError(
  error: unknown,
): (Error & { code?: unknown }) | undefined {
  const visited = new Set<Error>();
  let current = error;

  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);

    const errorWithCode = current as Error & { code?: unknown };
    if (
      typeof errorWithCode.code === 'string' &&
      RETRYABLE_NETWORK_ERROR_CODES.has(errorWithCode.code)
    ) {
      return errorWithCode;
    }

    current = (current as Error & { cause?: unknown }).cause;
  }

  return undefined;
}

export function handleFetchError({
  error,
  url,
  requestBodyValues,
}: {
  error: unknown;
  url: string;
  requestBodyValues: unknown;
}) {
  if (isAbortError(error)) {
    return error;
  }

  // unwrap original error when fetch failed (for easier debugging):
  if (
    error instanceof TypeError &&
    FETCH_FAILED_ERROR_MESSAGES.includes(error.message.toLowerCase())
  ) {
    const cause = (error as any).cause;

    if (cause != null) {
      // Failed to connect to server:
      return new APICallError({
        message: `Cannot connect to API: ${cause.message}`,
        cause,
        url,
        requestBodyValues,
        isRetryable: true, // retry when network error
      });
    }
  }

  const networkError = findNetworkError(error);

  if (networkError != null) {
    if (APICallError.isInstance(error)) {
      return new APICallError({
        message: error.message,
        cause: error.cause,
        url: error.url,
        requestBodyValues: error.requestBodyValues,
        statusCode: error.statusCode,
        responseHeaders: error.responseHeaders,
        responseBody: error.responseBody,
        data: error.data,
        isRetryable: true,
      });
    }

    return new APICallError({
      message: `Cannot connect to API: ${
        error instanceof Error ? error.message : networkError.message
      }`,
      cause: error,
      url,
      requestBodyValues,
      isRetryable: true,
    });
  }

  return error;
}
