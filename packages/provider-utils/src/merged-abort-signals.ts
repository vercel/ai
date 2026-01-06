/**
 * Merges multiple AbortSignals into a single AbortSignal.
 * The returned signal will abort when any of the input signals abort,
 * with the same reason as the first signal to abort.
 *
 * @param signals - The AbortSignals to merge.
 * @returns An AbortSignal that aborts when any of the input signals abort.
 */
export function mergedAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }

    signal.addEventListener(
      'abort',
      () => {
        controller.abort(signal.reason);
      },
      { once: true },
    );
  }

  return controller.signal;
}
