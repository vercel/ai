import { createResolvablePromise } from './create-resolvable-promise';

/**
 * Creates a stitchable stream that can pipe one stream at a time.
 *
 * @template T - The type of values emitted by the streams.
 * @returns {Object} An object containing the stitchable stream and control methods.
 */
export function createStitchableStream<T>(): {
  stream: ReadableStream<T>;
  addStream: (
    innerStream: ReadableStream<T>,
    callbacks?: {
      onError?: (error: unknown) => void;
      onCancel?: () => void;
    },
  ) => void;
  close: () => void;
  terminate: () => void;
} {
  let innerStreams: Array<{
    reader: ReadableStreamDefaultReader<T>;
    onError?: (error: unknown) => void;
    onCancel?: () => void;
  }> = [];
  let controller: ReadableStreamDefaultController<T> | null = null;
  let isClosed = false;
  let waitForNewStream = createResolvablePromise<void>();

  const terminate = () => {
    isClosed = true;
    waitForNewStream.resolve();

    innerStreams.forEach(({ reader, onCancel }) => {
      onCancel?.();
      reader.cancel();
    });
    innerStreams = [];
    controller?.close();
  };

  const processPull = async () => {
    // Case 1: Outer stream is closed and no more inner streams
    if (isClosed && innerStreams.length === 0) {
      controller?.close();
      return;
    }

    // Case 2: No inner streams available, but outer stream is open
    // wait for a new inner stream to be added or the outer stream to close
    if (innerStreams.length === 0) {
      waitForNewStream = createResolvablePromise<void>();
      await waitForNewStream.promise;
      return await processPull();
    }

    const currentStream = innerStreams[0];

    try {
      const { value, done } = await currentStream.reader.read();

      if (done) {
        // Case 3: Current inner stream is done
        innerStreams.shift(); // Remove the finished stream

        if (innerStreams.length === 0 && isClosed) {
          // when closed and no more inner streams, stop pulling
          controller?.close();
        } else {
          // continue pulling from the next stream
          await processPull();
        }
      } else {
        // Case 4: Current inner stream returns an item
        controller?.enqueue(value);
      }
    } catch (error) {
      // Case 5: Current inner stream throws an error
      currentStream.onError?.(error);
      controller?.error(error);
      innerStreams.shift(); // Remove the errored stream
      terminate(); // we have errored, terminate all streams
    }
  };

  return {
    stream: new ReadableStream<T>({
      start(controllerParam) {
        controller = controllerParam;
      },
      pull: processPull,
      async cancel() {
        for (const { reader, onCancel } of innerStreams) {
          onCancel?.();
          await reader.cancel();
        }
        innerStreams = [];
        isClosed = true;
      },
    }),
    addStream: (
      innerStream: ReadableStream<T>,
      callbacks?: {
        onError?: (error: unknown) => void;
        onCancel?: () => void;
      },
    ) => {
      if (isClosed) {
        throw new Error('Cannot add inner stream: outer stream is closed');
      }

      innerStreams.push({
        reader: innerStream.getReader(),
        ...callbacks,
      });
      waitForNewStream.resolve();
    },

    /**
     * Gracefully close the outer stream. This will let the inner streams
     * finish processing and then close the outer stream.
     */
    close: () => {
      isClosed = true;
      waitForNewStream.resolve();

      if (innerStreams.length === 0) {
        controller?.close();
      }
    },

    /**
     * Immediately close the outer stream. This will cancel all inner streams
     * and close the outer stream.
     */
    terminate,
  };
}
