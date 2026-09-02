import { InvalidArgumentError } from '../error/invalid-argument-error';

/**
 * SSE comment that is used to keep the connection alive.
 *
 * Lines that start with a colon are comments in the SSE wire format and are
 * ignored by conforming SSE parsers, so they never reach the client code.
 */
const KEEP_ALIVE_COMMENT = ': keep-alive\n\n';

const KEEP_ALIVE = Symbol('keep-alive');

/**
 * Wraps an SSE stream so that it never stays silent for longer than
 * `keepAliveMs` milliseconds:
 *
 * - a keep-alive comment is enqueued immediately, so the response head is
 *   flushed even when the source stream has not produced a chunk yet
 * - a keep-alive comment is enqueued whenever the source stream has been idle
 *   for `keepAliveMs` milliseconds
 *
 * Keep-alive comments are only enqueued when the consumer is ready to receive
 * data, so backpressure is preserved.
 */
export function createKeepAliveSseStream({
  stream,
  keepAliveMs,
}: {
  stream: ReadableStream<string>;
  keepAliveMs: number;
}): ReadableStream<string> {
  if (!Number.isFinite(keepAliveMs) || keepAliveMs <= 0) {
    throw new InvalidArgumentError({
      parameter: 'keepAliveMs',
      value: keepAliveMs,
      message: 'keepAliveMs must be a positive number',
    });
  }

  const reader = stream.getReader();

  // a single outstanding read is reused across keep-alive intervals,
  // otherwise reads would pile up on a long-idle source:
  let pendingRead: Promise<ReadableStreamReadResult<string>> | undefined;

  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(KEEP_ALIVE_COMMENT);
    },

    async pull(controller) {
      pendingRead ??= reader.read();

      let keepAliveTimeout: ReturnType<typeof setTimeout> | undefined;

      try {
        const result = await Promise.race([
          pendingRead,
          new Promise<typeof KEEP_ALIVE>(resolve => {
            keepAliveTimeout = setTimeout(
              () => resolve(KEEP_ALIVE),
              keepAliveMs,
            );
          }),
        ]);

        if (result === KEEP_ALIVE) {
          controller.enqueue(KEEP_ALIVE_COMMENT);
          return;
        }

        pendingRead = undefined;

        if (result.done) {
          controller.close();
        } else {
          controller.enqueue(result.value);
        }
      } catch (error) {
        pendingRead = undefined;
        controller.error(error);
      } finally {
        clearTimeout(keepAliveTimeout);
      }
    },

    cancel(reason) {
      pendingRead = undefined;
      // cancelling through the reader that we hold resolves a pending read
      // and cancels the source stream through the lock:
      return reader.cancel(reason);
    },
  });
}
