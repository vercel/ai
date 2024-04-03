import {
  EventSourceParserStream,
  ParsedEvent,
} from 'eventsource-parser/stream';
import { ZodSchema } from 'zod';
import { APICallError } from '../errors';
import { NoResponseBodyError } from '../errors/no-response-body-error';
import { ParseResult, parseJSON, safeParseJSON } from './parse-json';

export type ResponseHandler<RETURN_TYPE> = (options: {
  url: string;
  requestBodyValues: unknown;
  response: Response;
}) => PromiseLike<RETURN_TYPE>;

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

    // Some providers return an empty response body for some errors:
    if (responseBody.trim() === '') {
      return new APICallError({
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

      return new APICallError({
        message: errorToMessage(parsedError),
        url,
        requestBodyValues,
        statusCode: response.status,
        responseBody,
        data: parsedError,
        isRetryable: isRetryable?.(response, parsedError),
      });
    } catch (parseError) {
      return new APICallError({
        message: response.statusText,
        url,
        requestBodyValues,
        statusCode: response.status,
        responseBody,
        isRetryable: isRetryable?.(response),
      });
    }
  };

export const createEventSourceResponseHandler =
  <T>(
    chunkSchema: ZodSchema<T>,
  ): ResponseHandler<ReadableStream<ParseResult<T>>> =>
  async ({ response }: { response: Response }) => {
    if (response.body == null) {
      throw new NoResponseBodyError();
    }

    return response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventSourceParserStream())
      .pipeThrough(
        new TransformStream<ParsedEvent, ParseResult<T>>({
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
      );
  };

export const createJsonResponseHandler =
  <T>(responseSchema: ZodSchema<T>): ResponseHandler<T> =>
  async ({ response, url, requestBodyValues }) => {
    const responseBody = await response.text();

    const parsedResult = safeParseJSON({
      text: responseBody,
      schema: responseSchema,
    });

    if (!parsedResult.success) {
      throw new APICallError({
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
