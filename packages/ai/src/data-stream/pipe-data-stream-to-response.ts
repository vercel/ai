import { ServerResponse } from 'node:http';
import { prepareOutgoingHttpHeaders } from '../../core/util/prepare-outgoing-http-headers';
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
    headers: prepareOutgoingHttpHeaders(headers, {
      contentType: 'text/plain; charset=utf-8',
      dataStreamVersion: 'v1',
    }),
    stream: dataStream.pipeThrough(new TextEncoderStream()),
  });
}
