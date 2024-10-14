export function createAbortSignalWithTimeout({
  signal,
  timeoutMs,
}: {
  signal: AbortSignal | undefined;
  timeoutMs: number | undefined;
}): { signal: AbortSignal | undefined; clearTimeout: () => void } {
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
