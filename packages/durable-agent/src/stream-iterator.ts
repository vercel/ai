/**
 * Converts an AsyncGenerator to a ReadableStream.
 */
export function iteratorToStream<T>(
  iterator: AsyncGenerator<T>,
  options?: { signal?: AbortSignal },
): ReadableStream<T> {
  return new ReadableStream<T>({
    async pull(controller) {
      if (options?.signal?.aborted) {
        controller.close();
        return;
      }

      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    cancel() {
      iterator.return(undefined as any);
    },
  });
}

/**
 * Converts a ReadableStream to an AsyncIterable.
 *
 * @yields Items from the stream.
 */
export async function* streamToIterator<T>(
  stream: ReadableStream<T>,
): AsyncGenerator<T> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
