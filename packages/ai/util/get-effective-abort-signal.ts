export function getEffectiveAbortSignal(
  abortSignal: AbortSignal | undefined,
  timeout: number | undefined
): { signal: AbortSignal | undefined; clearTimeout: () => void } {
  let effectiveAbortSignal = abortSignal;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (abortSignal && abortSignal.aborted) {
    return { signal: abortSignal, clearTimeout: () => {} };
  }

  if (timeout && timeout > 0 && !effectiveAbortSignal) {
    const timeoutController = new AbortController();
    timeoutId = setTimeout(() => timeoutController.abort(), timeout);
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

