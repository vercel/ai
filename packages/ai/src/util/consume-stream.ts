/**
 * Consumes a ReadableStream until it's fully read.
 *
 * This function reads the stream chunk by chunk until the stream is exhausted.
 * It doesn't process or return the data from the stream; it simply ensures
 * that the entire stream is read.
 *
 * @param {ReadableStream} stream - The ReadableStream to be consumed.
 * @returns {Promise<void>} A promise that resolves when the stream is fully consumed.
 */
export async function consumeStream({
  stream,
  onError,
  abortSignal,
}: {
  stream: ReadableStream;
  onError?: (error: unknown) => void;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const reader = stream.getReader();
  let cancelPromise: Promise<void> | undefined;
  const cancelOnAbort = () => {
    cancelPromise ??= reader.cancel().catch(() => {});
  };

  if (abortSignal?.aborted) {
    cancelOnAbort();
  } else {
    abortSignal?.addEventListener('abort', cancelOnAbort, { once: true });
  }

  try {
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  } catch (error) {
    onError?.(error);
  } finally {
    await cancelPromise;
    abortSignal?.removeEventListener('abort', cancelOnAbort);
    reader.releaseLock();
  }
}
