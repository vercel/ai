import type { ServerResponse } from 'node:http';

type FlushableServerResponse = ServerResponse & {
  flush?: () => void;
};

/**
 * Writes the content of a stream to a server response.
 *
 * When the client disconnects before the stream has been fully written
 * (premature `close`), the stream is cancelled so that upstream resources
 * can be released, and no further chunks are written.
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
  headers?: Record<string, string | number | string[]>;
  stream: ReadableStream<Uint8Array>;
}): Promise<void> {
  const statusCode = status ?? 200;
  if (statusText !== undefined) {
    response.writeHead(statusCode, statusText, headers);
  } else {
    response.writeHead(statusCode, headers);
  }

  const reader = stream.getReader();

  // Detect client disconnects. `close` also fires after a regular `end()`;
  // `writableFinished` distinguishes the two cases.
  let clientDisconnected = false;
  let onDisconnect: (() => void) | undefined;
  const handleClose = () => {
    if (response.writableFinished) {
      return;
    }

    clientDisconnected = true;
    onDisconnect?.();

    // cancelling the reader resolves a pending read with `done: true`:
    reader.cancel(new Error('Client disconnected.')).catch(() => {});
  };
  response.once('close', handleClose);

  const read = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || clientDisconnected || response.destroyed) break;

        // Respect backpressure: if write() returns false, wait for 'drain' event
        const canContinue = response.write(value);
        const flush = (response as FlushableServerResponse).flush;
        if (typeof flush === 'function') {
          flush.call(response);
        }

        if (!canContinue) {
          await new Promise<void>(resolve => {
            // don't wait for `drain` on a disconnected response:
            onDisconnect = resolve;
            response.once('drain', resolve);
          });
          onDisconnect = undefined;
        }
      }
    } finally {
      response.off('close', handleClose);

      if (clientDisconnected || response.destroyed) {
        // release the stream; ending a destroyed response is not possible:
        reader.cancel().catch(() => {});
      } else {
        response.end();
      }
    }
  };

  return read();
}
