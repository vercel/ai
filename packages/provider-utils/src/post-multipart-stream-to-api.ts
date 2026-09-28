import { APICallError } from '@ai-sdk/provider';
import { convertAsyncIteratorToReadableStream } from './convert-async-iterator-to-readable-stream';
import { extractResponseHeaders } from './extract-response-headers';
import type { FetchFunction } from './fetch-function';
import { generateId } from './generate-id';
import { getRuntimeEnvironmentUserAgent } from './get-runtime-environment-user-agent';
import { handleFetchError } from './handle-fetch-error';
import { isAbortError } from './is-abort-error';
import type { ResponseHandler } from './response-handler';
import { VERSION } from './version';
import { withUserAgentSuffix } from './with-user-agent-suffix';

// use function to allow for mocking in tests:
const getOriginalFetch = () => globalThis.fetch;

/**
 * A part of a streaming multipart/form-data request body.
 *
 * Parts are emitted in array order, which providers may depend on
 * (e.g. xAI requires expiry fields to precede the file part).
 */
export type MultipartStreamPart =
  | { type: 'field'; name: string; value: string }
  | {
      type: 'file';
      name: string;
      filename?: string;
      mediaType?: string;
      content: ReadableStream<Uint8Array> | Uint8Array;
    };

// header parameter values must not smuggle CR/LF or break the quoted-string
function escapeMultipartHeaderValue(value: string): string {
  return value
    .replace(/[\r\n]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

interface MultipartBody {
  stream: ReadableStream<Uint8Array>;
  /**
   * Deterministically releases every stream part after a failed or abandoned
   * request — fetch implementations do not reliably cancel streaming request
   * bodies on rejection/abort. Safe to call multiple times.
   */
  dispose: (reason?: unknown) => Promise<void>;
}

function createMultipartBody(
  parts: Array<MultipartStreamPart>,
  boundary: string,
): MultipartBody {
  const encoder = new TextEncoder();

  let disposed = false;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const enteredStreams = new Set<ReadableStream<Uint8Array>>();

  async function* emitParts(): AsyncGenerator<Uint8Array> {
    for (const part of parts) {
      if (disposed) return;

      const disposition = `--${boundary}\r\nContent-Disposition: form-data; name="${escapeMultipartHeaderValue(part.name)}"`;

      if (part.type === 'field') {
        yield encoder.encode(`${disposition}\r\n\r\n${part.value}\r\n`);
        continue;
      }

      // a filename parameter is always emitted: without it, multipart
      // parsers treat the part as a scalar field (FormData defaults to
      // "blob" as well)
      const filenameParameter = `; filename="${escapeMultipartHeaderValue(
        part.filename ?? 'blob',
      )}"`;
      const mediaType = (part.mediaType ?? 'application/octet-stream').replace(
        /[\r\n]/g,
        '',
      );

      yield encoder.encode(
        `${disposition}${filenameParameter}\r\nContent-Type: ${mediaType}\r\n\r\n`,
      );

      if (part.content instanceof Uint8Array) {
        yield part.content;
      } else {
        // synchronous handoff (no awaits) so dispose() sees either the
        // active reader or an un-entered stream, never neither
        const reader = part.content.getReader();
        activeReader = reader;
        enteredStreams.add(part.content);

        let finished = false;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done || disposed) {
              finished = done;
              break;
            }
            yield value;
          }
        } finally {
          activeReader = undefined;
          // early teardown (dispose/cancel): release the source stream
          if (!finished) {
            await reader.cancel().catch(() => {});
          }
          reader.releaseLock();
        }

        if (disposed) return;
      }

      yield encoder.encode('\r\n');
    }

    yield encoder.encode(`--${boundary}--\r\n`);
  }

  return {
    stream: convertAsyncIteratorToReadableStream(emitParts()),
    async dispose(reason?: unknown) {
      if (disposed) return;
      disposed = true;

      // an active reader holds the lock; cancelling it resolves a pending
      // read() and propagates cancellation to the underlying source
      const reader = activeReader;
      if (reader != null) {
        await reader.cancel(reason).catch(() => {});
      }

      // streams the generator never entered are still unlocked
      for (const part of parts) {
        if (
          part.type === 'file' &&
          !(part.content instanceof Uint8Array) &&
          !enteredStreams.has(part.content)
        ) {
          await part.content.cancel(reason).catch(() => {});
        }
      }
    },
  };
}

/**
 * POSTs a multipart/form-data body as a request stream, so file parts backed
 * by a `ReadableStream` are sent without buffering the full file in memory.
 *
 * Requires a fetch implementation that supports streaming request bodies
 * (`duplex: 'half'`). Callers with fully buffered payloads can keep using
 * `postFormDataToApi`.
 */
export const postMultipartStreamToApi = async <T>({
  url,
  headers = {},
  parts,
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
  fetch = getOriginalFetch(),
}: {
  url: string;
  headers?: Record<string, string | undefined>;
  parts: Array<MultipartStreamPart>;
  failedResponseHandler: ResponseHandler<Error>;
  successfulResponseHandler: ResponseHandler<T>;
  abortSignal?: AbortSignal;
  fetch?: FetchFunction;
}) => {
  const boundary = `ai-sdk-multipart-${generateId()}`;

  // stream contents cannot be replayed for error reporting; expose part
  // names, field values, and file placeholders only
  const requestBodyValues = Object.fromEntries(
    parts.map(part => [
      part.name,
      part.type === 'field'
        ? part.value
        : `<file:${part.filename ?? part.name}>`,
    ]),
  );

  const body = createMultipartBody(parts, boundary);

  try {
    const requestInit: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: withUserAgentSuffix(
        {
          ...headers,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        `ai-sdk/provider-utils/${VERSION}`,
        getRuntimeEnvironmentUserAgent(),
      ),
      body: body.stream,
      duplex: 'half',
      signal: abortSignal,
    };

    const response = await fetch(url, requestInit);

    const responseHeaders = extractResponseHeaders(response);

    if (!response.ok) {
      let errorInformation: {
        value: Error;
        responseHeaders?: Record<string, string> | undefined;
      };

      try {
        errorInformation = await failedResponseHandler({
          response,
          url,
          requestBodyValues,
        });
      } catch (error) {
        if (isAbortError(error) || APICallError.isInstance(error)) {
          throw error;
        }

        throw new APICallError({
          message: 'Failed to process error response',
          cause: error,
          statusCode: response.status,
          url,
          responseHeaders,
          requestBodyValues,
        });
      }

      throw errorInformation.value;
    }

    try {
      return await successfulResponseHandler({
        response,
        url,
        requestBodyValues,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (isAbortError(error) || APICallError.isInstance(error)) {
          throw error;
        }
      }

      throw new APICallError({
        message: 'Failed to process successful response',
        cause: error,
        statusCode: response.status,
        url,
        responseHeaders,
        requestBodyValues,
      });
    }
  } catch (error) {
    // fetch implementations do not reliably cancel streaming request bodies
    // on rejection/abort — release every source part deterministically
    await body.dispose(error);
    throw handleFetchError({ error, url, requestBodyValues });
  }
};
