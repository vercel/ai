import { mergeAbortSignals, setAbortTimeout } from 'ai/internal';

/**
 * Timers that limit one model call: the whole call, the wait for its first
 * output chunk, and the wait between two output chunks.
 *
 * The timers run inside the durable model step, where timer APIs are
 * available, and start again for every model call. Each timer aborts the
 * returned signal with a `TimeoutError`, like `streamText` and `generateText`.
 */
export function createModelCallTimeouts({
  abortSignal,
  stepTimeoutMs,
  firstChunkTimeoutMs,
  chunkTimeoutMs,
}: {
  /** Signal of the call, which already includes the total deadline. */
  abortSignal: AbortSignal | undefined;
  stepTimeoutMs?: number;
  firstChunkTimeoutMs?: number;
  chunkTimeoutMs?: number;
}) {
  const stepAbortController =
    stepTimeoutMs == null ? undefined : new AbortController();
  const firstChunkAbortController =
    firstChunkTimeoutMs == null ? undefined : new AbortController();
  const chunkAbortController =
    chunkTimeoutMs == null ? undefined : new AbortController();

  const mergedAbortSignal = mergeAbortSignals(
    abortSignal,
    stepAbortController?.signal,
    firstChunkAbortController?.signal,
    chunkAbortController?.signal,
  );

  let stepTimeoutId: ReturnType<typeof setTimeout> | undefined;
  let firstChunkTimeoutId: ReturnType<typeof setTimeout> | undefined;
  let chunkTimeoutId: ReturnType<typeof setTimeout> | undefined;

  function clearFirstChunkTimeout() {
    if (firstChunkTimeoutId != null) {
      clearTimeout(firstChunkTimeoutId);
      firstChunkTimeoutId = undefined;
    }
  }

  function clearChunkTimeout() {
    if (chunkTimeoutId != null) {
      clearTimeout(chunkTimeoutId);
      chunkTimeoutId = undefined;
    }
  }

  function clearOutputTimeouts() {
    clearFirstChunkTimeout();
    clearChunkTimeout();
  }

  return {
    /** Aborts when the call signal aborts or when one of the timers fires. */
    abortSignal: mergedAbortSignal,

    /** Starts the step timer. Call it before the model call is dispatched. */
    startStepTimeout() {
      if (mergedAbortSignal?.aborted) {
        return;
      }
      stepTimeoutId = setAbortTimeout({
        abortController: stepAbortController,
        label: 'Step',
        timeoutMs: stepTimeoutMs,
      });
    },

    /** Starts the first-chunk timer. Call it when the response stream starts. */
    startFirstChunkTimeout() {
      if (mergedAbortSignal?.aborted) {
        return;
      }
      firstChunkTimeoutId = setAbortTimeout({
        abortController: firstChunkAbortController,
        label: 'First chunk',
        timeoutMs: firstChunkTimeoutMs,
      });
    },

    /**
     * Records an output chunk: the first-chunk timer is done and the chunk
     * timer starts again.
     */
    onOutputChunk() {
      clearFirstChunkTimeout();
      clearChunkTimeout();
      if (mergedAbortSignal?.aborted) {
        return;
      }
      chunkTimeoutId = setAbortTimeout({
        abortController: chunkAbortController,
        label: 'Chunk',
        timeoutMs: chunkTimeoutMs,
      });
    },

    /** Stops the output timers. Call it when the model call has finished. */
    clearOutputTimeouts,

    /** Stops all timers. */
    clear() {
      if (stepTimeoutId != null) {
        clearTimeout(stepTimeoutId);
        stepTimeoutId = undefined;
      }
      clearOutputTimeouts();
    },
  };
}

/**
 * Reads a stream until it ends or the signal aborts.
 *
 * A provider can ignore the abort signal and keep its stream open. The read is
 * cancelled here so that a timeout ends the model call in that case too.
 *
 * @param stream - The stream to read.
 * @param abortSignal - Signal that ends the read when it aborts.
 * @yields The parts of the stream, in order.
 */
export async function* readUntilAborted<T>(
  stream: ReadableStream<T>,
  abortSignal: AbortSignal | undefined,
): AsyncGenerator<T> {
  const reader = stream.getReader();
  const cancel = () => {
    // Cancelling rejects when the provider has already failed the stream.
    // The pending read reports that error.
    reader.cancel(abortSignal?.reason).catch(() => {});
  };

  if (abortSignal?.aborted) {
    cancel();
  } else {
    abortSignal?.addEventListener('abort', cancel, { once: true });
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      yield value;
    }
  } finally {
    abortSignal?.removeEventListener('abort', cancel);
    // Cancel the source when the consumer stops early, as `for await` over
    // the stream itself does.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
