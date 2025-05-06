import { ServerResponse } from 'node:http';
import { prepareHeaders } from '../../core/util/prepare-headers';
import { writeToServerResponse } from '../../core/util/write-to-server-response';
import { DataStreamText } from './data-stream-parts';

export function pipeDataStreamToResponse({
  response,
  status,
  statusText,
  headers,
  dataStream,
}: {
  response: ServerResponse;
  dataStream: ReadableStream<DataStreamText>;
} & ResponseInit): void {
  writeToServerResponse({
    response,
    status,
    statusText,
    headers: Object.fromEntries(
      prepareHeaders(headers, {
        'content-type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      }).entries(),
    ),
    stream: dataStream.pipeThrough(new TextEncoderStream()),
  });
}
