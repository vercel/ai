import { prepareHeaders } from '../util/prepare-headers';
import { JsonToSseTransformStream } from './json-to-sse-transform-stream';
import { UI_MESSAGE_STREAM_HEADERS } from './ui-message-stream-headers';
import { UIMessageChunk } from './ui-message-chunks';
import { UIMessageStreamResponseInit } from './ui-message-stream-response-init';

export function createUIMessageStreamResponse({
  status,
  statusText,
  headers,
  stream,
  consumeSseStream,
}: UIMessageStreamResponseInit & {
  stream: ReadableStream<UIMessageChunk>;
}): Response {
  let sseStream = stream.pipeThrough(new JsonToSseTransformStream());

  // when the consumeSseStream is provided, we need to tee the stream
  // and send the second part to the consumeSseStream function
  // so that it can be consumed by the client independently
  if (consumeSseStream) {
    const [stream1, stream2] = sseStream.tee();
    sseStream = stream1;
    consumeSseStream({ stream: stream2 }); // no await (do not block the response)
  }

  return new Response(sseStream.pipeThrough(new TextEncoderStream()), {
    status,
    statusText,
    headers: prepareHeaders(headers, UI_MESSAGE_STREAM_HEADERS),
  });
}
