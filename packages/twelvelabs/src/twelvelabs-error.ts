import { APICallError } from '@ai-sdk/provider';

export class TwelveLabsError extends APICallError {
  constructor({
    message,
    statusCode,
    responseBody,
    cause,
    url = '',
  }: {
    message: string;
    statusCode?: number;
    responseBody?: string;
    cause?: Error;
    url?: string;
  }) {
    super({
      message,
      url,
      requestBodyValues: {},
      statusCode,
      responseBody,
      cause,
      isRetryable: statusCode === 429 || statusCode === 503,
    });
  }
}

export function mapTwelveLabsError(error: any): Error {
  const errorMessage = error?.message || String(error);
  const statusCode = error?.status || error?.statusCode;

  // Authentication errors
  if (statusCode === 401 || errorMessage.includes('api_key_invalid')) {
    return new TwelveLabsError({
      message: 'Invalid Twelve Labs API key',
      statusCode: 401,
      cause: error,
    });
  }

  // Rate limit errors
  if (statusCode === 429 || errorMessage.includes('rate limit')) {
    return new TwelveLabsError({
      message: 'Twelve Labs rate limit exceeded',
      statusCode: 429,
      cause: error,
    });
  }

  // Service unavailable
  if (
    statusCode === 503 ||
    errorMessage.includes('service temporarily unavailable')
  ) {
    return new TwelveLabsError({
      message: 'Twelve Labs service temporarily unavailable',
      statusCode: 503,
      cause: error,
    });
  }

  // Not found errors
  if (statusCode === 404 || errorMessage.includes('not found')) {
    return new TwelveLabsError({
      message: `Resource not found: ${errorMessage}`,
      statusCode: 404,
      cause: error,
    });
  }

  // Invalid parameters
  if (statusCode === 400 || errorMessage.includes('parameter')) {
    return new TwelveLabsError({
      message: `Invalid parameter: ${errorMessage}`,
      statusCode: 400,
      cause: error,
    });
  }

  // Video processing errors
  if (errorMessage.includes('video')) {
    return new TwelveLabsError({
      message: `Video processing error: ${errorMessage}`,
      statusCode: 400,
      cause: error,
    });
  }

  // Default error
  return new TwelveLabsError({
    message: errorMessage,
    statusCode: statusCode || 500,
    cause: error,
  });
}
