import { convertDataContentToUint8Array } from '../../util/format/DataContent';
import { Schema } from '../schema/Schema';
import { parseJSON, safeParseJSON } from '../schema/parseJSON';
import { ApiCallError } from './ApiCallError';

export type ResponseHandler<T> = (options: {
  url: string;
  requestBodyValues: unknown;
  response: Response;
}) => PromiseLike<T>;

export const createJsonErrorResponseHandler =
  <T>({
    errorSchema,
    errorToMessage,
    isRetryable,
  }: {
    errorSchema: Schema<T>;
    errorToMessage: (error: T) => string;
    isRetryable?: (response: Response, error?: T) => boolean;
  }): ResponseHandler<ApiCallError> =>
  async ({ response, url, requestBodyValues }) => {
    const responseBody = await response.text();

    // Some providers return an empty response body for some errors:
    if (responseBody.trim() === '') {
      return new ApiCallError({
        message: response.statusText,
        url,
        requestBodyValues,
        statusCode: response.status,
        responseBody,
        isRetryable: isRetryable?.(response),
      });
    }

    // resilient parsing in case the response is not JSON or does not match the schema:
    try {
      const parsedError = parseJSON({
        text: responseBody,
        schema: errorSchema,
      });

      return new ApiCallError({
        message: errorToMessage(parsedError),
        url,
        requestBodyValues,
        statusCode: response.status,
        responseBody,
        data: parsedError,
        isRetryable: isRetryable?.(response, parsedError),
      });
    } catch (parseError) {
      return new ApiCallError({
        message: response.statusText,
        url,
        requestBodyValues,
        statusCode: response.status,
        responseBody,
        isRetryable: isRetryable?.(response),
      });
    }
  };

export const createTextErrorResponseHandler =
  ({
    isRetryable,
  }: {
    isRetryable?: (response: Response) => boolean;
  } = {}): ResponseHandler<ApiCallError> =>
  async ({ response, url, requestBodyValues }) => {
    const responseBody = await response.text();

    return new ApiCallError({
      message: responseBody.trim() !== '' ? responseBody : response.statusText,
      url,
      requestBodyValues,
      statusCode: response.status,
      responseBody,
      isRetryable: isRetryable?.(response),
    });
  };

export const createJsonResponseHandler =
  <T>(responseSchema: Schema<T>): ResponseHandler<T> =>
  async ({ response, url, requestBodyValues }) => {
    const responseBody = await response.text();

    const parsedResult = safeParseJSON({
      text: responseBody,
      schema: responseSchema,
    });

    if (!parsedResult.success) {
      throw new ApiCallError({
        message: 'Invalid JSON response',
        cause: parsedResult.error,
        statusCode: response.status,
        responseBody,
        url,
        requestBodyValues,
      });
    }

    return parsedResult.value;
  };

export const createTextResponseHandler =
  (): ResponseHandler<string> =>
  async ({ response }) =>
    response.text();

export const createAudioMpegResponseHandler =
  (): ResponseHandler<Uint8Array> =>
  async ({ response, url, requestBodyValues }) => {
    if (response.headers.get('Content-Type') !== 'audio/mpeg') {
      throw new ApiCallError({
        message: 'Invalid Content-Type (must be audio/mpeg)',
        statusCode: response.status,
        url,
        requestBodyValues,
      });
    }

    return convertDataContentToUint8Array(await response.arrayBuffer());
  };

export const postJsonToApi = async <T>({
  url,
  headers,
  body,
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
}: {
  url: string;
  headers?: Record<string, string>;
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
  headers?: Record<string, string>;
  body: {
    content: string | FormData | Uint8Array;
    values: unknown;
  };
  failedResponseHandler: ResponseHandler<Error>;
  successfulResponseHandler: ResponseHandler<T>;
  abortSignal?: AbortSignal;
}) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
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
          isRetryable: true,
        });
      }
    }

    throw error;
  }
};
