import type { ServerResponse } from 'node:http';
import { prepareHeaders } from '../util/prepare-headers';
import { writeToServerResponse } from '../util/write-to-server-response';
import { createKeepAliveSseStream } from './create-keep-alive-sse-stream';
import { JsonToSseTransformStream } from './json-to-sse-transform-stream';
import { UI_MESSAGE_STREAM_HEADERS } from './ui-message-stream-headers';
import type { UIMessageChunk } from './ui-message-chunks';
import type { UIMessageStreamResponseInit } from './ui-message-stream-response-init';

/**
 * Pipes a UI message stream to a Node.js ServerResponse object.
 * The stream is transformed to Server-Sent Events (SSE) format.
 *
 * @param options.response - The Node.js ServerResponse object to write to.
 * @param options.status - The HTTP status code for the response.
 * @param options.statusText - The HTTP status text for the response.
 * @param options.headers - Additional HTTP headers to include in the response.
 * @param options.stream - The UI message chunk stream to send.
 * @param options.consumeSseStream - Optional callback to consume a copy of the SSE stream independently.
 * @param options.keepAliveMs - Optional interval in milliseconds at which SSE keep-alive comments are sent while the stream is idle.
 * @returns A promise that resolves when the stream has been written.
 */
export function pipeUIMessageStreamToResponse({
  response,
  status,
  statusText,
  headers,
  stream,
  consumeSseStream,
  keepAliveMs,
}: {
  response: ServerResponse;
  stream: ReadableStream<UIMessageChunk>;
} & UIMessageStreamResponseInit): Promise<void> {
  let sseStream = stream.pipeThrough(new JsonToSseTransformStream());

  // when the consumeSseStream is provided, we need to tee the stream
  // and send the second part to the consumeSseStream function
  // so that it can be consumed by the client independently
  if (consumeSseStream) {
    const [stream1, stream2] = sseStream.tee();
    sseStream = stream1;
    consumeSseStream({ stream: stream2 }); // no await (do not block the response)
  }

  // keep-alive comments are transport-level and added after the tee,
  // so they are not sent to consumeSseStream:
  if (keepAliveMs != null) {
    sseStream = createKeepAliveSseStream({ stream: sseStream, keepAliveMs });
  }

  return writeToServerResponse({
    response,
    status,
    statusText,
    headers: Object.fromEntries(
      prepareHeaders(headers, UI_MESSAGE_STREAM_HEADERS).entries(),
    ),
    stream: sseStream.pipeThrough(new TextEncoderStream()),
  });
}
