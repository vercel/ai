export function convertArrayToReadableStream<T>(
  values: T[],
): ReadableStream<T> {
  return new ReadableStream({
    start(controller) {
      for (const value of values) {
        controller.enqueue(value);
      }
      controller.close();
    },
  });
}
