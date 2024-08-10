import { mergeStreams } from '../core/util/merge-streams';
import { prepareResponseHeaders } from '../core/util/prepare-response-headers';
import { StreamData } from './stream-data';

/**
 * A utility class for streaming text responses.
 *
 * @deprecated Use `streamText.toDataStreamResponse()` (if you did send StreamData)
 * or a regular `Response` instead (if you did not send any StreamData):
 *
 * ```ts
 * return new Response(stream, {
 *   status: 200,
 *   contentType: 'text/plain; charset=utf-8',
 * })
 * ```
 */
export class StreamingTextResponse extends Response {
  constructor(res: ReadableStream, init?: ResponseInit, data?: StreamData) {
    let processedStream = res;

    if (data) {
      processedStream = mergeStreams(data.stream, res);
    }

    super(processedStream as any, {
      ...init,
      status: 200,
      headers: prepareResponseHeaders(init, {
        contentType: 'text/plain; charset=utf-8',
      }),
    });
  }
}
