import type { ServerResponse } from 'node:http';
import { StreamData } from './stream-data';
import { mergeStreams } from '../core/util/merge-streams';

/**
 * A utility function to stream a ReadableStream to a Node.js response-like object.
 */
export function streamToResponse(
  res: ReadableStream,
  response: ServerResponse,
  init?: { headers?: Record<string, string>; status?: number },
  data?: StreamData,
) {
  response.writeHead(init?.status ?? 200, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...init?.headers,
  });

  let processedStream = res;

  if (data) {
    processedStream = mergeStreams(data.stream, res);
  }

  const reader = processedStream.getReader();
  function read() {
    reader.read().then(({ done, value }: { done: boolean; value?: any }) => {
      if (done) {
        response.end();
        return;
      }
      response.write(value);
      read();
    });
  }
  read();
}
