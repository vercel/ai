import { mergeStreams } from '../core/util/merge-streams';
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
    const headers = new Headers(init?.headers ?? {});
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'text/plain; charset=utf-8');
    }

    super(processedStream as any, {
      ...init,
      status: 200,
      headers,
    });
  }
}
