import { ServerResponse } from 'node:http';
import { prepareOutgoingHttpHeaders } from '../../core/util/prepare-outgoing-http-headers';
import { writeToServerResponse } from '../../core/util/write-to-server-response';

export function pipeTextStreamToResponse(
  response: ServerResponse,
  {
    status,
    statusText,
    headers,
    textStream,
  }: ResponseInit & {
    textStream: ReadableStream<string>;
  },
): void {
  writeToServerResponse({
    response,
    status,
    statusText,
    headers: prepareOutgoingHttpHeaders(headers, {
      contentType: 'text/plain; charset=utf-8',
    }),
    stream: textStream.pipeThrough(new TextEncoderStream()),
  });
}
