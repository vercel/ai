const STREAM_OPEN_COMMENT = ': stream-open\n\n';
const KEEP_ALIVE_COMMENT = ': keep-alive\n\n';

export function createSseStreamWithKeepAlive({
  stream,
  keepAliveMs,
}: {
  stream: ReadableStream<string>;
  keepAliveMs: number | undefined;
}): ReadableStream<string> {
  if (keepAliveMs == null) {
    return stream;
  }

  if (
    !Number.isFinite(keepAliveMs) ||
    keepAliveMs <= 0 ||
    keepAliveMs > 2_147_483_647
  ) {
    throw new Error(
      'keepAliveMs must be a positive finite timer duration no greater than 2147483647',
    );
  }

  const reader = stream.getReader();
  let keepAliveTimeout: ReturnType<typeof setTimeout> | undefined;
  let isCancelled = false;

  const clearKeepAliveTimeout = () => {
    clearTimeout(keepAliveTimeout);
    keepAliveTimeout = undefined;
  };

  const scheduleKeepAlive = (
    controller: ReadableStreamDefaultController<string>,
  ) => {
    clearKeepAliveTimeout();
    keepAliveTimeout = setTimeout(() => {
      if (isCancelled) {
        return;
      }

      if (controller.desiredSize != null && controller.desiredSize > 0) {
        controller.enqueue(KEEP_ALIVE_COMMENT);
      }

      scheduleKeepAlive(controller);
    }, keepAliveMs);
  };

  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(STREAM_OPEN_COMMENT);
      scheduleKeepAlive(controller);
    },

    pull(controller) {
      return reader.read().then(
        result => {
          clearKeepAliveTimeout();

          if (isCancelled) {
            return;
          }

          if (result.done) {
            controller.close();
          } else {
            controller.enqueue(result.value);
            scheduleKeepAlive(controller);
          }
        },
        error => {
          clearKeepAliveTimeout();

          if (!isCancelled) {
            throw error;
          }
        },
      );
    },

    async cancel(reason) {
      isCancelled = true;
      clearKeepAliveTimeout();
      await reader.cancel(reason);
    },
  });
}
