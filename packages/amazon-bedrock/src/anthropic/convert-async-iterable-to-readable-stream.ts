export function convertAsyncIterableToReadableStream<T>(
  iterable: AsyncIterable<T>,
) {
  const iterator = iterable[Symbol.asyncIterator]();
  return new ReadableStream<T>({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },

    async cancel(reason) {
      await iterator.return?.(reason);
    },
  });
}
