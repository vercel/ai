import { prepareHeaders } from '../util/prepare-headers';
import { uiMessageStreamHeaders } from './ui-message-stream-headers';
import { UIMessageStreamPart } from './ui-message-stream-parts';
import { JsonToSseTransformStream } from './json-to-sse-transform-stream';

export function createUIMessageStreamResponse({
  status,
  statusText,
  headers,
  stream,
}: ResponseInit & {
  stream: ReadableStream<UIMessageStreamPart>;
}): Response {
  return new Response(
    stream
      .pipeThrough(new JsonToSseTransformStream())
      .pipeThrough(new TextEncoderStream()),
    {
      status,
      statusText,
      headers: prepareHeaders(headers, uiMessageStreamHeaders),
    },
  );
}
