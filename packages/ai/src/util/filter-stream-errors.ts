export function filterStreamErrors<T>(
  readable: ReadableStream<T>,
  onError: ({
    error,
    controller,
  }: {
    error: unknown;
    controller: ReadableStreamDefaultController<T>;
  }) => Promise<void> | void,
): ReadableStream<T> {
  return new ReadableStream<T>({
    async start(controller) {
      const reader = readable.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }
          controller.enqueue(value);
        }
      } catch (error) {
        await onError({ error, controller });
      }
    },
    cancel(reason) {
      return readable.cancel(reason);
    },
  });
}
