import type { ServerResponse } from 'node:http';

type FlushableServerResponse = ServerResponse & {
  flush?: () => void;
};

/**
 * Writes the content of a stream to a server response.
 *
 * Cancels the provided stream branch when the response closes before the
 * stream finishes.
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
  const reader = stream.getReader();
  const disconnectError = new Error('Client disconnected.');
  let responseClosed = false;
  let resolveDrainWait: (() => void) | undefined;
  let cancelPromise: Promise<void> | undefined;

  function cancelReader() {
    if (cancelPromise == null) {
      cancelPromise = reader.cancel(disconnectError);
      void cancelPromise.catch(() => {});
    }
  }

  function handleClose() {
    if (responseClosed) {
      return;
    }

    responseClosed = true;
    resolveDrainWait?.();
    cancelReader();
  }

  response.once('close', handleClose);

  if (response.destroyed) {
    handleClose();
  }

  const write = async () => {
    try {
      if (responseClosed) {
        return;
      }

      const statusCode = status ?? 200;
      if (statusText !== undefined) {
        response.writeHead(statusCode, statusText, headers);
      } else {
        response.writeHead(statusCode, headers);
      }

      while (!responseClosed) {
        const { done, value } = await reader.read();

        if (done || responseClosed) {
          break;
        }

        if (response.destroyed) {
          handleClose();
          break;
        }

        // Respect backpressure: if write() returns false, wait for 'drain' event
        const canContinue = response.write(value);

        if (response.destroyed) {
          handleClose();
        }

        if (responseClosed) {
          break;
        }

        const flush = (response as FlushableServerResponse).flush;
        if (typeof flush === 'function') {
          flush.call(response);
        }

        if (!canContinue) {
          await new Promise<void>(resolve => {
            let settled = false;

            const finishWaiting = () => {
              if (settled) {
                return;
              }

              settled = true;
              response.off('drain', finishWaiting);

              if (resolveDrainWait === finishWaiting) {
                resolveDrainWait = undefined;
              }

              resolve();
            };

            resolveDrainWait = finishWaiting;
            response.once('drain', finishWaiting);

            if (responseClosed || response.destroyed) {
              handleClose();
              finishWaiting();
            }
          });
        }
      }
    } catch (error) {
      if (!responseClosed && !response.destroyed) {
        throw error;
      }
    } finally {
      response.off('close', handleClose);
      resolveDrainWait?.();

      if (responseClosed || response.destroyed) {
        cancelReader();
      } else {
        response.end();
      }
    }
  };

  return write();
}
