import { ServerResponse } from 'node:http';
import { prepareHeaders } from '../util/prepare-headers';
import { writeToServerResponse } from '../util/write-to-server-response';
import { JsonToSseTransformStream } from './json-to-sse-transform-stream';
import { UI_MESSAGE_STREAM_HEADERS } from './ui-message-stream-headers';
import { UIMessageStreamPart } from './ui-message-stream-parts';
import { UIMessageStreamResponseInit } from './ui-message-stream-response-init';

export function pipeUIMessageStreamToResponse({
  response,
  status,
  statusText,
  headers,
  stream,
  consumeSseStream,
}: {
  response: ServerResponse;
  stream: ReadableStream<UIMessageStreamPart>;
} & UIMessageStreamResponseInit): void {
  let sseStream = stream.pipeThrough(new JsonToSseTransformStream());

  // when the consumeSseStream is provided, we need to tee the stream
  // and send the second part to the consumeSseStream function
  // so that it can be consumed by the client independently
  if (consumeSseStream) {
    const [stream1, stream2] = sseStream.tee();
    sseStream = stream1;
    consumeSseStream({ stream: stream2 }); // no await (do not block the response)
  }

  writeToServerResponse({
    response,
    status,
    statusText,
    headers: Object.fromEntries(
      prepareHeaders(headers, UI_MESSAGE_STREAM_HEADERS).entries(),
    ),
    stream: sseStream.pipeThrough(new TextEncoderStream()),
  });
}
