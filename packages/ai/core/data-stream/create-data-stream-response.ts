import { prepareResponseHeaders } from '../util/prepare-response-headers';
import { createDataStream } from './create-data-stream';
import { DataStream } from './data-stream';

export function createDataStreamResponse({
  status,
  statusText,
  headers,
  execute,
  onError,
}: ResponseInit & {
  execute: (dataStream: DataStream) => Promise<void> | void;
  onError?: (error: unknown) => string;
}): Response {
  return new Response(
    createDataStream({ execute, onError }).pipeThrough(new TextEncoderStream()),
    {
      status,
      statusText,
      headers: prepareResponseHeaders(headers, {
        contentType: 'text/plain; charset=utf-8',
        dataStreamVersion: 'v1',
      }),
    },
  );
}
