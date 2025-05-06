import { ServerResponse } from 'node:http';
import { prepareResponseHeaders } from '../../core/util/prepare-response-headers';
import { writeToServerResponse } from '../../core/util/write-to-server-response';

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
      prepareResponseHeaders(headers, {
        contentType: 'text/plain; charset=utf-8',
      }).entries(),
    ),
    stream: textStream.pipeThrough(new TextEncoderStream()),
  });
}
