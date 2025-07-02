import { prepareHeaders } from '../util/prepare-headers';

export function createTextStreamResponse({
  status,
  statusText,
  headers,
  textStream,
}: ResponseInit & {
  textStream: ReadableStream<string>;
}): Response {
  return new Response(textStream.pipeThrough(new TextEncoderStream()), {
    status: status ?? 200,
    statusText,
    headers: prepareHeaders(headers, {
      'content-type': 'text/plain; charset=utf-8',
    }),
  });
}
