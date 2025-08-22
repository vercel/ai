export type AsyncIterableStream<T> = AsyncIterable<T> & ReadableStream<T>;

export function createAsyncIterableStream<T>(
  source: ReadableStream<T>,
): AsyncIterableStream<T> {
  const stream = source.pipeThrough(new TransformStream<T, T>());

  (stream as AsyncIterableStream<T>)[Symbol.asyncIterator] = function (
    this: ReadableStream<T>,
  ): AsyncIterator<T> {
    const reader = this.getReader();

    let finished = false;

    async function cleanup() {
      finished = true;
      try {
        await reader.cancel?.();
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }
    }

    return {
      async next(): Promise<IteratorResult<T>> {
        if (finished) {
          return { done: true, value: undefined };
        }

        const { done, value } = await reader.read();

        if (done) {
          await cleanup();
          return { done: true, value: undefined };
        }

        return { done: false, value };
      },

      // Called on early exit (e.g., break from for-await)
      async return(): Promise<IteratorResult<T>> {
        await cleanup();
        return { done: true, value: undefined };
      },

      // Called on early exit with error
      async throw(err: unknown): Promise<IteratorResult<T>> {
        await cleanup();
        throw err;
      },
    };
  };

  return stream as AsyncIterableStream<T>;
}
