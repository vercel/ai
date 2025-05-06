import { prepareHeaders } from '../../core/util/prepare-headers';
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
    headers: prepareHeaders(headers, {
      'content-type': 'text/plain; charset=utf-8',
      'x-vercel-ai-data-stream': 'v1',
    }),
  });
}
