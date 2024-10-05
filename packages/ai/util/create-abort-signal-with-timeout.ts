type CreateAbortSignalWithTimeoutOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function createAbortSignalWithTimeout({
  signal,
  timeoutMs
}: CreateAbortSignalWithTimeoutOptions = {}): { signal: AbortSignal | undefined; clearTimeout: () => void } {
  let effectiveAbortSignal = signal;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (signal && signal.aborted) {
    return { signal, clearTimeout: () => {} };
  }

  if (timeoutMs && timeoutMs > 0 && !effectiveAbortSignal) {
    const timeoutController = new AbortController();
    timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    effectiveAbortSignal = timeoutController.signal;
  }

  return {
    signal: effectiveAbortSignal,
    clearTimeout: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    },
  };
}

