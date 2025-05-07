import { ServerResponse } from 'node:http';
import { prepareHeaders } from '../util/prepare-headers';
import { writeToServerResponse } from '../util/write-to-server-response';
import { dataStreamHeaders } from './data-stream-headers';
import { DataStreamPart } from './data-stream-parts';
import { JsonToSseTransformStream } from './json-to-sse-transform-stream';

export function pipeDataStreamToResponse({
  response,
  status,
  statusText,
  headers,
  dataStream,
}: {
  response: ServerResponse;
  dataStream: ReadableStream<DataStreamPart>;
} & ResponseInit): void {
  writeToServerResponse({
    response,
    status,
    statusText,
    headers: Object.fromEntries(
      prepareHeaders(headers, dataStreamHeaders).entries(),
    ),
    stream: dataStream
      .pipeThrough(new JsonToSseTransformStream())
      .pipeThrough(new TextEncoderStream()),
  });
}
