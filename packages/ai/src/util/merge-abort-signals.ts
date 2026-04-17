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
  // TODO use filterNullable
  const validSignals = signals.filter(
    (signal): signal is AbortSignal => signal != null,
  );

  return validSignals.length === 0
    ? undefined
    : validSignals.length === 1
      ? validSignals[0]
      : AbortSignal.any(validSignals);
}
