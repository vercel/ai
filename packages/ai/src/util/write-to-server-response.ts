import type { ServerResponse } from 'node:http';

type FlushableServerResponse = ServerResponse & {
  flush?: () => void;
};

/**
 * Writes the content of a stream to a server response.
 */
export function writeToServerResponse({
  response,
  status,
  statusText,
  headers,
  stream,
}: {
  response: ServerResponse;
  status?: number;
  statusText?: string;
  headers?: Headers;
  stream: ReadableStream<Uint8Array>;
}): Promise<void> {
  const statusCode = status ?? 200;
  if (headers != null) {
    response.setHeaders(headers);
  }

  if (statusText !== undefined) {
    response.writeHead(statusCode, statusText);
  } else {
    response.writeHead(statusCode);
  }

  const reader = stream.getReader();
  const read = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Respect backpressure: if write() returns false, wait for 'drain' event
        const canContinue = response.write(value);
        const flush = (response as FlushableServerResponse).flush;
        if (typeof flush === 'function') {
          flush.call(response);
        }

        if (!canContinue) {
          await new Promise<void>(resolve => {
            response.once('drain', resolve);
          });
        }
      }
    } finally {
      response.end();
    }
  };

  return read();
}
