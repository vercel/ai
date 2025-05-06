import { ServerResponse } from 'node:http';
import { prepareResponseHeaders } from '../../core/util/prepare-response-headers';
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
      prepareResponseHeaders(headers, {
        contentType: 'text/plain; charset=utf-8',
        dataStreamVersion: 'v1',
      }).entries(),
    ),
    stream: dataStream.pipeThrough(new TextEncoderStream()),
  });
}
