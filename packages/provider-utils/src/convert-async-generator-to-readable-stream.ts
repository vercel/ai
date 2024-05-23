/**
 * Converts an AsyncGenerator to a ReadableStream.
 *
 * @template T - The type of elements produced by the AsyncGenerator.
 * @param {AsyncGenerator<T>} stream - The AsyncGenerator to convert.
 * @returns {ReadableStream<T>} - A ReadableStream that provides the same data as the AsyncGenerator.
 */
export function convertAsyncGeneratorToReadableStream<T>(
  stream: AsyncGenerator<T>,
): ReadableStream<T> {
  return new ReadableStream<T>({
    /**
     * Called when the consumer wants to pull more data from the stream.
     *
     * @param {ReadableStreamDefaultController<T>} controller - The controller to enqueue data into the stream.
     * @returns {Promise<void>}
     */
    async pull(controller) {
      try {
        const { value, done } = await stream.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
    /**
     * Called when the consumer cancels the stream.
     */
    cancel() {},
  });
}
