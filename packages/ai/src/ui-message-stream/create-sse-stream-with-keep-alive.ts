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
  let pendingRead: Promise<ReadableStreamReadResult<string>> | undefined;
  let keepAliveTimeout: ReturnType<typeof setTimeout> | undefined;

  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(STREAM_OPEN_COMMENT);
    },

    async pull(controller) {
      pendingRead ??= reader.read();

      let result:
        | { type: 'source'; value: ReadableStreamReadResult<string> }
        | { type: 'keep-alive' };

      try {
        result = await Promise.race([
          pendingRead.then(value => ({ type: 'source' as const, value })),
          new Promise<{ type: 'keep-alive' }>(resolve => {
            keepAliveTimeout = setTimeout(
              () => resolve({ type: 'keep-alive' }),
              keepAliveMs,
            );
          }),
        ]);
      } finally {
        clearTimeout(keepAliveTimeout);
        keepAliveTimeout = undefined;
      }

      if (result.type === 'keep-alive') {
        controller.enqueue(KEEP_ALIVE_COMMENT);
        return;
      }

      pendingRead = undefined;

      if (result.value.done) {
        controller.close();
      } else {
        controller.enqueue(result.value.value);
      }
    },

    async cancel(reason) {
      clearTimeout(keepAliveTimeout);
      await reader.cancel(reason);
    },
  });
}
