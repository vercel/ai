import {
  APICallError,
  EmptyResponseBodyError,
  InvalidArgumentError,
} from '@ai-sdk/provider';
import { DownloadError } from './download-error';
import { extractResponseHeaders } from './extract-response-headers';
import { handleFetchError } from './handle-fetch-error';
import { isAbortError } from './is-abort-error';
import {
  compileBinaryFieldPaths,
  createJsonBinaryFieldScanner,
  withBinaryFields,
} from './json-binary-field-scanner';
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

const DEFAULT_MAX_JSON_LINE_BYTES = 64 * 1024 * 1024;

function wrapResponseBodyStream({
  stream,
  url,
  requestBodyValues,
  statusCode,
  responseHeaders,
}: {
  stream: ReadableStream<Uint8Array>;
  url: string;
  requestBodyValues: unknown;
  statusCode: number;
  responseHeaders: Record<string, string>;
}): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let readerReleased = false;

  const releaseReader = () => {
    if (!readerReleased) {
      reader.releaseLock();
      readerReleased = true;
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();

        if (done) {
          releaseReader();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        releaseReader();

        if (isAbortError(error)) {
          controller.error(error);
          return;
        }

        controller.error(
          handleFetchError({
            error: new APICallError({
              message: 'Failed to process successful response',
              cause: error,
              statusCode,
              url,
              responseHeaders,
              requestBodyValues,
            }),
            url,
            requestBodyValues,
          }),
        );
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        releaseReader();
      }
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
          statusCode: response.status,
          responseHeaders,
        }),
        schema: chunkSchema,
      }),
    };
  };

export const createJsonResponseHandler = <T>(
  responseSchema: FlexibleSchema<T>,
  {
    experimental_binaryFields,
  }: {
    /**
     * Paths of string fields that carry large base64 data, e.g. `['images[*]']`
     * or `['content[*].data.data']`. A path is a sequence of plain object keys
     * joined by `.`, with `[*]` for every element of an array.
     *
     * By default the whole body is buffered, decoded to text, parsed, and the
     * base64 string is decoded again later, which holds about four copies of
     * the data at once. With this option the body is read as a stream and the
     * strings at these paths are decoded to `Uint8Array` while they arrive.
     *
     * A string is only decoded if it is canonical base64 (standard alphabet,
     * padded, no whitespace or escape sequences) and decodes to at least 64 KiB.
     * Other strings, and strings at other paths, are parsed as usual, so the
     * schema has to accept both a string and a `Uint8Array` at these paths.
     *
     * Differences to the default behavior:
     * - Validation and the returned `value` contain the decoded `Uint8Array`.
     * - `rawValue`, the `value` of a `TypeValidationError`, the text of a
     *   `JSONParseError` and `APICallError.responseBody` contain a short
     *   placeholder string such as `[binary data: 2097152 bytes; ref ...]` in
     *   place of the data.
     * - `JSON.stringify` of a decoded `Uint8Array` gives the same placeholder
     *   as long as the validation can fail, so the message of an error that a
     *   validator builds from the value, or from its issues, stays short.
     */
    experimental_binaryFields?: readonly string[];
  } = {},
): ResponseHandler<T> => {
  const binaryFieldPaths = experimental_binaryFields?.length
    ? compileBinaryFieldPaths(experimental_binaryFields)
    : undefined;

  return async ({ response, url, requestBodyValues }) => {
    let responseBody: string;
    let schema = responseSchema;

    if (binaryFieldPaths == null) {
      responseBody = await readResponseBodyAsText({ response, url });
    } else {
      const scanner = createJsonBinaryFieldScanner(binaryFieldPaths);
      await readResponseWithSizeLimit({ response, url, onChunk: scanner.push });
      const scanned = scanner.finish();
      responseBody = scanned.text;
      schema = withBinaryFields(responseSchema, scanned.binaries);
    }

    const parsedResult = await safeParseJSON({ text: responseBody, schema });

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
};

export const createJsonLinesResponseHandler = <T>(
  responseSchema: FlexibleSchema<T>,
  {
    maxLineBytes = DEFAULT_MAX_JSON_LINE_BYTES,
  }: { maxLineBytes?: number } = {},
): ResponseHandler<AsyncGenerator<T>> => {
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes <= 0) {
    throw new InvalidArgumentError({
      argument: 'maxLineBytes',
      message: 'maxLineBytes must be a positive safe integer.',
    });
  }

  return async ({ response, url }) => {
    const responseHeaders = extractResponseHeaders(response);

    if (response.body == null) {
      throw new EmptyResponseBodyError({});
    }

    return {
      responseHeaders,
      value: parseJsonLines({
        stream: response.body,
        schema: responseSchema,
        url,
        maxLineBytes,
      }),
    };
  };
};

async function* parseJsonLines<T>({
  stream,
  schema,
  url,
  maxLineBytes,
}: {
  stream: ReadableStream<Uint8Array>;
  schema: FlexibleSchema<T>;
  url: string;
  maxLineBytes: number;
}): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lineBytes = 0;
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        finished = true;
        buffer += decoder.decode();
        break;
      }

      let offset = 0;
      while (offset < value.length) {
        const lineEnd = value.indexOf(10, offset);
        const segmentEnd = lineEnd === -1 ? value.length : lineEnd;

        // Bound each line before decoding it, excluding the newline byte.
        lineBytes += segmentEnd - offset;
        if (lineBytes > maxLineBytes) {
          throw new DownloadError({
            message: `JSON Lines response exceeded maximum line size of ${maxLineBytes} bytes.`,
            url,
          });
        }

        const decodeEnd = lineEnd === -1 ? segmentEnd : lineEnd + 1;
        buffer += decoder.decode(value.subarray(offset, decodeEnd), {
          stream: true,
        });

        if (lineEnd === -1) {
          break;
        }

        const line = buffer.slice(0, -1).replace(/\r$/, '');
        buffer = '';
        lineBytes = 0;
        offset = decodeEnd;

        if (line.trim().length > 0) {
          yield await parseJSON({ text: line, schema });
        }
      }
    }

    const finalLine = buffer.replace(/\r$/, '');
    if (finalLine.trim().length > 0) {
      yield await parseJSON({ text: finalLine, schema });
    }
  } finally {
    if (!finished) {
      await reader.cancel().catch(() => {});
    }
    reader.releaseLock();
  }
}

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

/**
 * Passes the response body through as a `ReadableStream<Uint8Array>` without
 * buffering it (unlike `createBinaryResponseHandler`). The consumer is
 * responsible for draining or cancelling the stream.
 */
export const createBinaryStreamResponseHandler =
  (): ResponseHandler<ReadableStream<Uint8Array>> =>
  async ({ response, url, requestBodyValues }) => {
    const responseHeaders = extractResponseHeaders(response);

    if (response.body == null) {
      throw new EmptyResponseBodyError({});
    }

    return {
      responseHeaders,
      value: wrapResponseBodyStream({
        stream: response.body,
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
      }),
    };
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
