import { ApiCallError } from '../errors/api-call-error';
import { ResponseHandler } from './response-handler';

export const postJsonToApi = async <T>({
  url,
  headers,
  body,
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
}: {
  url: string;
  headers?: Record<string, string | undefined>;
  body: unknown;
  failedResponseHandler: ResponseHandler<ApiCallError>;
  successfulResponseHandler: ResponseHandler<T>;
  abortSignal?: AbortSignal;
}) =>
  postToApi({
    url,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: {
      content: JSON.stringify(body),
      values: body,
    },
    failedResponseHandler,
    successfulResponseHandler,
    abortSignal,
  });

export const postToApi = async <T>({
  url,
  headers = {},
  body,
  successfulResponseHandler,
  failedResponseHandler,
  abortSignal,
}: {
  url: string;
  headers?: Record<string, string | undefined>;
  body: {
    content: string | FormData | Uint8Array;
    values: unknown;
  };
  failedResponseHandler: ResponseHandler<Error>;
  successfulResponseHandler: ResponseHandler<T>;
  abortSignal?: AbortSignal;
}) => {
  try {
    // remove undefined headers:
    const definedHeaders = Object.fromEntries(
      Object.entries(headers).filter(([_key, value]) => value != null),
    ) as Record<string, string>;

    const response = await fetch(url, {
      method: 'POST',
      headers: definedHeaders,
      body: body.content,
      signal: abortSignal,
    });

    if (!response.ok) {
      try {
        throw await failedResponseHandler({
          response,
          url,
          requestBodyValues: body.values,
        });
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'AbortError' || error instanceof ApiCallError) {
            throw error;
          }
        }

        throw new ApiCallError({
          message: 'Failed to process error response',
          cause: error,
          statusCode: response.status,
          url,
          requestBodyValues: body.values,
        });
      }
    }

    try {
      return await successfulResponseHandler({
        response,
        url,
        requestBodyValues: body.values,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error instanceof ApiCallError) {
          throw error;
        }
      }

      throw new ApiCallError({
        message: 'Failed to process successful response',
        cause: error,
        statusCode: response.status,
        url,
        requestBodyValues: body.values,
      });
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw error;
      }
    }

    // unwrap original error when fetch failed (for easier debugging):
    if (error instanceof TypeError && error.message === 'fetch failed') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cause = (error as any).cause;

      if (cause != null) {
        // Failed to connect to server:
        throw new ApiCallError({
          message: `Cannot connect to API: ${cause.message}`,
          cause,
          url,
          requestBodyValues: body.values,
          isRetryable: true, // retry when network error
        });
      }
    }

    throw error;
  }
};
