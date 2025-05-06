import { ServerResponse } from 'node:http';
import { prepareHeaders } from '../../core/util/prepare-headers';
import { writeToServerResponse } from '../../core/util/write-to-server-response';
import { dataStreamHeaders } from './data-stream-headers';
import { DataStreamPart } from './data-stream-parts';
import { DataStreamToSSETransformStream } from './data-stream-to-sse-transform-stream';

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
      .pipeThrough(new DataStreamToSSETransformStream())
      .pipeThrough(new TextEncoderStream()),
  });
}
