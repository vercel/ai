import { ServerResponse } from 'node:http';
import { prepareHeaders } from '../util/prepare-headers';
import { writeToServerResponse } from '../util/write-to-server-response';

export function pipeTextStreamToResponse({
  response,
  status,
  statusText,
  headers,
  textStream,
}: {
  response: ServerResponse;
  textStream: ReadableStream<string>;
} & ResponseInit): void {
  writeToServerResponse({
    response,
    status,
    statusText,
    headers: Object.fromEntries(
      prepareHeaders(headers, {
        'content-type': 'text/plain; charset=utf-8',
      }).entries(),
    ),
    stream: textStream.pipeThrough(new TextEncoderStream()),
  });
}
