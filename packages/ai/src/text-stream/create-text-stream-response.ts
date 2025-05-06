import { prepareResponseHeaders } from '../../core/util/prepare-response-headers';

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
    headers: prepareResponseHeaders(headers, {
      contentType: 'text/plain; charset=utf-8',
    }),
  });
}
