import { APICallError } from '@ai-sdk/provider';
import { isAbortError } from './is-abort-error';

const FETCH_FAILED_ERROR_MESSAGES = ['fetch failed', 'failed to fetch'];

const BUN_ERROR_CODES = [
  'ConnectionRefused',
  'ConnectionClosed',
  'FailedToOpenSocket',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
];

const UNDICI_NETWORK_ERROR_CODES = [
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
];

function findNetworkError(
  error: unknown,
): (Error & { code?: string }) | undefined {
  let current = error;

  for (let index = 0; index < 10 && current instanceof Error; index++) {
    const code = (current as any).code;
    if (
      typeof code === 'string' &&
      (BUN_ERROR_CODES.includes(code) ||
        UNDICI_NETWORK_ERROR_CODES.includes(code))
    ) {
      return current;
    }

    current = (current as any).cause;
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
