import { mergeStreams } from '../core/util/merge-streams';
import { prepareResponseHeaders } from '../core/util/prepare-response-headers';
import { StreamData } from './stream-data';

/**
 * A utility class for streaming text responses.
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
