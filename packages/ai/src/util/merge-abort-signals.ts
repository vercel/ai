/**
 * Merges multiple AbortSignals into a single AbortSignal.
 * The returned signal will abort when any of the input signals abort,
 * with the same reason as the first signal to abort.
 *
 * @param signals - The AbortSignals to merge. Null and undefined values are filtered out.
 * @returns An AbortSignal that aborts when any of the input signals abort,
 *          or undefined if no valid signals are provided.
 */
export function mergeAbortSignals(
  ...signals: (AbortSignal | null | undefined)[]
): AbortSignal | undefined {
  const validSignals = signals.filter(
    (signal): signal is AbortSignal => signal != null,
  );

  if (validSignals.length === 0) {
    return undefined;
  }

  if (validSignals.length === 1) {
    return validSignals[0];
  }

  return AbortSignal.any(validSignals);
}
