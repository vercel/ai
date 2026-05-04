/**
 * Schedules a timeout that aborts the given controller with a `TimeoutError`
 * `DOMException`, matching the reason produced by `AbortSignal.timeout(ms)`.
 *
 * @param controller - The controller to abort when the timeout elapses.
 * @param label - Human-readable label included in the error message
 * (e.g. "Step", "Chunk").
 * @param ms - Duration in milliseconds before the controller is aborted.
 * @returns The timeout id, suitable for passing to `clearTimeout`.
 */
export function setAbortTimeout({
  controller,
  label,
  ms,
}: {
  controller: AbortController;
  label: string;
  ms: number;
}): ReturnType<typeof setTimeout> {
  return setTimeout(
    () =>
      controller.abort(
        new DOMException(
          `${label} timeout of ${ms}ms exceeded`,
          'TimeoutError',
        ),
      ),
    ms,
  );
}
