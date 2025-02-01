import { APICallError, EmptyResponseBodyError } from '@ai-sdk/provider';
import {
  EventSourceParserStream,
  EventSourceMessage,
} from 'eventsource-parser/stream';
import { ZodSchema } from 'zod';
import { extractResponseHeaders } from './extract-response-headers';
import { ParseResult, parseJSON, safeParseJSON } from './parse-json';

export type ResponseHandler<RETURN_TYPE> = (options: {
  url: string;
  requestBodyValues: unknown;
  response: Response;
}) => PromiseLike<{
  value: RETURN_TYPE;
  rawValue?: unknown;
  responseHeaders?: Record<string, string>;
}>;

export const createJsonErrorResponseHandler =
  <T>({
    errorSchema,
    errorToMessage,
    isRetryable,
  }: {
    errorSchema: ZodSchema<T>;
    errorToMessage: (error: T) => string;
    isRetryable?: (response: Response, error?: T) => boolean;
  }): ResponseHandler<APICallError> =>
  async ({ response, url, requestBodyValues }) => {
    const responseBody = await response.text();
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
      const parsedError = parseJSON({
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
    } catch (parseError) {
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
    chunkSchema: ZodSchema<T>,
  ): ResponseHandler<ReadableStream<ParseResult<T>>> =>
  async ({ response }: { response: Response }) => {
    const responseHeaders = extractResponseHeaders(response);

    if (response.body == null) {
      throw new EmptyResponseBodyError({});
    }

    return {
      responseHeaders,
      value: response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream())
        .pipeThrough(
          new TransformStream<EventSourceMessage, ParseResult<T>>({
            transform({ data }, controller) {
              // ignore the 'DONE' event that e.g. OpenAI sends:
              if (data === '[DONE]') {
                return;
              }

              controller.enqueue(
                safeParseJSON({
                  text: data,
                  schema: chunkSchema,
                }),
              );
            },
          }),
        ),
    };
  };

export const createJsonStreamResponseHandler =
  <T>(
    chunkSchema: ZodSchema<T>,
  ): ResponseHandler<ReadableStream<ParseResult<T>>> =>
  async ({ response }: { response: Response }) => {
    const responseHeaders = extractResponseHeaders(response);

    if (response.body == null) {
      throw new EmptyResponseBodyError({});
    }

    let buffer = '';

    return {
      responseHeaders,
      value: response.body.pipeThrough(new TextDecoderStream()).pipeThrough(
        new TransformStream<string, ParseResult<T>>({
          transform(chunkText, controller) {
            if (chunkText.endsWith('\n')) {
              controller.enqueue(
                safeParseJSON({
                  text: buffer + chunkText,
                  schema: chunkSchema,
                }),
              );
              buffer = '';
            } else {
              buffer += chunkText;
            }
          },
        }),
      ),
    };
  };

export const createJsonResponseHandler =
  <T>(responseSchema: ZodSchema<T>): ResponseHandler<T> =>
  async ({ response, url, requestBodyValues }) => {
    const responseBody = await response.text();

    const parsedResult = safeParseJSON({
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
    const responseBody = await response.text();

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
