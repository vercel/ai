import { ServerResponse } from 'node:http';
import { prepareOutgoingHttpHeaders } from '../util/prepare-outgoing-http-headers';
import { writeToServerResponse } from '../util/write-to-server-response';
import { createDataStream } from './create-data-stream';
import { DataStream } from './data-stream';

export function pipeDataStreamToResponse(
  response: ServerResponse,
  {
    status,
    statusText,
    headers,
    execute,
    onError,
  }: ResponseInit & {
    execute: (dataStream: DataStream) => Promise<void> | void;
    onError?: (error: unknown) => string;
  },
): void {
  writeToServerResponse({
    response,
    status,
    statusText,
    headers: prepareOutgoingHttpHeaders(headers, {
      contentType: 'text/plain; charset=utf-8',
      dataStreamVersion: 'v1',
    }),
    stream: createDataStream({ execute, onError }).pipeThrough(
      new TextEncoderStream(),
    ),
  });
}
