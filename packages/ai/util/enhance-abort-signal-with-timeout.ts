import { createMergedAbortSignal } from './create-merged-abort-signal';
import { createTimeoutAbortSignal } from './create-timeout-abort-signal';

export function enhanceAbortSignalWithTimeout({
  signal,
  timeoutInMs,
}: {
  signal: AbortSignal | undefined;
  timeoutInMs: number | undefined;
}): { signal: AbortSignal | undefined; clearTimeoutSignal: () => void } {
  if (timeoutInMs == null || signal?.aborted) {
    return { signal, clearTimeoutSignal: () => {} };
  }

  const { signal: timeoutSignal, clearTimeoutSignal } =
    createTimeoutAbortSignal(timeoutInMs);

  return {
    signal: createMergedAbortSignal(signal, timeoutSignal),
    clearTimeoutSignal,
  };
}
