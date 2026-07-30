/**
 * Creates a Promise that resolves after a specified delay
 * @param delayInMs - The delay duration in milliseconds. If null or undefined, resolves immediately.
 * @param signal - Optional AbortSignal to cancel the delay
 * @returns A Promise that resolves after the specified delay
 * @throws {Error} With the name `AbortError` when the signal is aborted
 */
export async function delay(
  delayInMs?: number | null,
  options?: {
    abortSignal?: AbortSignal;
  },
): Promise<void> {
  if (delayInMs == null) {
    return Promise.resolve();
  }

  const signal = options?.abortSignal;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, delayInMs);

    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal?.addEventListener('abort', onAbort);
  });
}

function createAbortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('Delay was aborted', 'AbortError');
  }

  const error = new Error('Delay was aborted');
  error.name = 'AbortError';
  return error;
}
