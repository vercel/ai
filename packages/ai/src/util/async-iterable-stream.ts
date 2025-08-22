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

    return {
      async next(): Promise<IteratorResult<T>> {
        if (finished) return { done: true, value: undefined };
        const { done, value } = await reader.read();
        if (done) {
          finished = true;
          reader.releaseLock();
          return { done: true, value: undefined };
        }
        return { done: false, value };
      },

      async return(): Promise<IteratorResult<T>> {
        // Called on early exit (e.g., break from for-await)
        finished = true;
        try {
          await reader.cancel?.();
        } finally {
          try {
            reader.releaseLock();
          } catch {}
        }
        return { done: true, value: undefined };
      },

      async throw(err: unknown): Promise<IteratorResult<T>> {
        finished = true;
        try {
          await reader.cancel?.(err);
        } finally {
          try {
            reader.releaseLock();
          } catch {}
        }
        throw err;
      },
    };
  };

  return stream as AsyncIterableStream<T>;
}
