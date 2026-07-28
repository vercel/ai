import { APICallError, EmptyResponseBodyError } from '@ai-sdk/provider';
import { extractResponseHeaders } from './extract-response-headers';
import { handleFetchError } from './handle-fetch-error';
import { parseJSON, safeParseJSON, type ParseResult } from './parse-json';
import { parseJsonEventStream } from './parse-json-event-stream';
import { readResponseWithSizeLimit } from './read-response-with-size-limit';
import type { FlexibleSchema } from './schema';

export type ResponseHandler<RETURN_TYPE> = (options: {
  url: string;
  requestBodyValues: unknown;
  response: Response;
}) => PromiseLike<{
  value: RETURN_TYPE;
  rawValue?: unknown;
  responseHeaders?: Record<string, string>;
}>;

const textDecoder = new TextDecoder();

function wrapResponseBodyStream({
  stream,
  url,
  requestBodyValues,
}: {
  stream: ReadableStream<Uint8Array>;
  url: string;
  requestBodyValues: unknown;
}) {
  const reader = stream.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();

        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(handleFetchError({ error, url, requestBodyValues }));
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

async function readResponseBodyAsText({
  response,
  url,
}: {
  response: Response;
  url: string;
}) {
  return textDecoder.decode(
    await readResponseWithSizeLimit({
      response,
      url,
    }),
  );
}

export const createJsonErrorResponseHandler =
  <T>({
    errorSchema,
    errorToMessage,
    isRetryable,
  }: {
    errorSchema: FlexibleSchema<T>;
    errorToMessage: (error: T) => string;
    isRetryable?: (response: Response, error?: T) => boolean;
  }): ResponseHandler<APICallError> =>
  async ({ response, url, requestBodyValues }) => {
    const responseBody = await readResponseBodyAsText({ response, url });
    const responseHeaders = extractResponseHeaders(response);

    // Some providers return an empty response body for some errors:
    if (responseBody.trim() === '') {
      return {
        responseHeaders,
        value: new APICallError({
          message: response.statusText,
          url,
          requestBodyValues,
          statusCode: response.status,
          responseHeaders,
          responseBody,
          isRetryable: isRetryable?.(response),
        }),
      };
    }

    // resilient parsing in case the response is not JSON or does not match the schema:
    try {
      const parsedError = await parseJSON({
        text: responseBody,
        schema: errorSchema,
      });

      return {
        responseHeaders,
        value: new APICallError({
          message: errorToMessage(parsedError),
          url,
          requestBodyValues,
          statusCode: response.status,
          responseHeaders,
          responseBody,
          data: parsedError,
          isRetryable: isRetryable?.(response, parsedError),
        }),
      };
    } catch {
      return {
        responseHeaders,
        value: new APICallError({
          message: response.statusText,
          url,
          requestBodyValues,
          statusCode: response.status,
          responseHeaders,
          responseBody,
          isRetryable: isRetryable?.(response),
        }),
      };
    }
  };

export const createEventSourceResponseHandler =
  <T>(
    chunkSchema: FlexibleSchema<T>,
  ): ResponseHandler<ReadableStream<ParseResult<T>>> =>
  async ({ response, url, requestBodyValues }) => {
    const responseHeaders = extractResponseHeaders(response);

    if (response.body == null) {
      throw new EmptyResponseBodyError({});
    }

    return {
      responseHeaders,
      value: parseJsonEventStream({
        stream: wrapResponseBodyStream({
          stream: response.body,
          url,
          requestBodyValues,
        }),
        schema: chunkSchema,
      }),
    };
  };

export const createJsonResponseHandler =
  <T>(responseSchema: FlexibleSchema<T>): ResponseHandler<T> =>
  async ({ response, url, requestBodyValues }) => {
    const responseBody = await readResponseBodyAsText({ response, url });

    const parsedResult = await safeParseJSON({
      text: responseBody,
      schema: responseSchema,
    });

    const responseHeaders = extractResponseHeaders(response);

    if (!parsedResult.success) {
      throw new APICallError({
        message: 'Invalid JSON response',
        cause: parsedResult.error,
        statusCode: response.status,
        responseHeaders,
        responseBody,
        url,
        requestBodyValues,
      });
    }

    return {
      responseHeaders,
      value: parsedResult.value,
      rawValue: parsedResult.rawValue,
    };
  };

export const createBinaryResponseHandler =
  (): ResponseHandler<Uint8Array> =>
  async ({ response, url, requestBodyValues }) => {
    const responseHeaders = extractResponseHeaders(response);

    if (!response.body) {
      throw new APICallError({
        message: 'Response body is empty',
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody: undefined,
      });
    }

    try {
      const buffer = await response.arrayBuffer();
      return {
        responseHeaders,
        value: new Uint8Array(buffer),
      };
    } catch (error) {
      throw new APICallError({
        message: 'Failed to read response as array buffer',
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody: undefined,
        cause: error,
      });
    }
  };

export const createStatusCodeErrorResponseHandler =
  (): ResponseHandler<APICallError> =>
  async ({ response, url, requestBodyValues }) => {
    const responseHeaders = extractResponseHeaders(response);
    const responseBody = await readResponseBodyAsText({ response, url });

    return {
      responseHeaders,
      value: new APICallError({
        message: response.statusText,
        url,
        requestBodyValues: requestBodyValues as Record<string, unknown>,
        statusCode: response.status,
        responseHeaders,
        responseBody,
      }),
    };
  };
