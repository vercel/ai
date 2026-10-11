/**
 * Creates a Promise that resolves after a specified delay
 * @param delayInMs - The delay duration in milliseconds. If null or undefined, resolves immediately.
 * @param signal - Optional AbortSignal to cancel the delay
 * @returns A Promise that resolves after the specified delay
 * @throws The AbortSignal reason when the signal is aborted
 */
export async function delay(
  delayInMs?: number | null,
  options?: {
    abortSignal?: AbortSignal;
  },
): Promise<void> {
  if (delayInMs == null) {
    return;
  }

  const signal = options?.abortSignal;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(getAbortReason(signal));
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
      reject(getAbortReason(signal!));
    };

    signal?.addEventListener('abort', onAbort);
  });
}

function getAbortReason(signal: AbortSignal): unknown {
  return signal.reason !== undefined
    ? signal.reason
    : new DOMException('Delay was aborted', 'AbortError');
}
