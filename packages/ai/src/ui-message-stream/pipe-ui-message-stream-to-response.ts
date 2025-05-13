import { ServerResponse } from 'node:http';
import { prepareHeaders } from '../util/prepare-headers';
import { writeToServerResponse } from '../util/write-to-server-response';
import { uiMessageStreamHeaders } from './ui-message-stream-headers';
import { UIMessageStreamPart } from './ui-message-stream-parts';
import { JsonToSseTransformStream } from './json-to-sse-transform-stream';

export function pipeUIMessageStreamToResponse({
  response,
  status,
  statusText,
  headers,
  stream,
}: {
  response: ServerResponse;
  stream: ReadableStream<UIMessageStreamPart>;
} & ResponseInit): void {
  writeToServerResponse({
    response,
    status,
    statusText,
    headers: Object.fromEntries(
      prepareHeaders(headers, uiMessageStreamHeaders).entries(),
    ),
    stream: stream
      .pipeThrough(new JsonToSseTransformStream())
      .pipeThrough(new TextEncoderStream()),
  });
}
