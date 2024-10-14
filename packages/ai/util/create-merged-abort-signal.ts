export function createMergedAbortSignal(
  ...signals: AbortSignal[]
): AbortSignal {
  const controller = new AbortController();

  const abortHandler = () => {
    controller.abort();

    // Clean up event listeners
    signals.forEach(signal => {
      signal.removeEventListener('abort', abortHandler);
    });
  };

  for (const signal of signals) {
    // If any signal is already aborted, abort immediately
    if (signal.aborted) {
      abortHandler();
      return controller.signal;
    }

    signal.addEventListener('abort', abortHandler);
  }

  return controller.signal;
}
