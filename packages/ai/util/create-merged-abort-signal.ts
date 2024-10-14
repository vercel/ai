// Note: this is effectively an AbortSignal.any polyfill (available in Node.js 20+)
export function createMergedAbortSignal(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal {
  const realSignals = signals.filter(signal => signal != null) as AbortSignal[];

  const controller = new AbortController();

  const abortHandler = () => {
    controller.abort();

    // Clean up event listeners
    realSignals.forEach(signal => {
      signal.removeEventListener('abort', abortHandler);
    });
  };

  for (const signal of realSignals) {
    // If any signal is already aborted, abort immediately
    if (signal.aborted) {
      abortHandler();
      return controller.signal;
    }

    signal.addEventListener('abort', abortHandler);
  }

  return controller.signal;
}
