import { prepareResponseHeaders } from '../../core/util/prepare-response-headers';
import { DataStreamText } from './data-stream-parts';

export function createDataStreamResponse({
  status,
  statusText,
  headers,
  dataStream,
}: ResponseInit & {
  dataStream: ReadableStream<DataStreamText>;
}): Response {
  return new Response(dataStream.pipeThrough(new TextEncoderStream()), {
    status,
    statusText,
    headers: prepareResponseHeaders(headers, {
      contentType: 'text/plain; charset=utf-8',
      dataStreamVersion: 'v1',
    }),
  });
}
