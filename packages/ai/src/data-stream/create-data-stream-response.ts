import { prepareHeaders } from '../../core/util/prepare-headers';
import { dataStreamHeaders } from './data-stream-headers';
import { DataStreamPart } from './data-stream-parts';
import { DataStreamToSSETransformStream } from './data-stream-to-sse-transform-stream';

export function createDataStreamResponse({
  status,
  statusText,
  headers,
  dataStream,
}: ResponseInit & {
  dataStream: ReadableStream<DataStreamPart>;
}): Response {
  return new Response(
    dataStream
      .pipeThrough(new DataStreamToSSETransformStream())
      .pipeThrough(new TextEncoderStream()),
    {
      status,
      statusText,
      headers: prepareHeaders(headers, dataStreamHeaders),
    },
  );
}
