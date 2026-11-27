/**
 * Waits for `ms` milliseconds, resolving early when `abortSignal` aborts.
 *
 * The timer is unref'd, so the wait does not keep the process alive: a
 * process with no other pending work exits during the wait, and the promise
 * never settles. This suits background waits, e.g. reconnect backoffs, but
 * not waits that a caller is blocked on, e.g. a retry delay within a request
 * the caller awaits.
 */
export function sleep({
  ms,
  abortSignal,
}: {
  ms: number;
  abortSignal?: AbortSignal;
}): Promise<void> {
  return new Promise(resolve => {
    if (abortSignal?.aborted) {
      resolve();
      return;
    }

    let settled = false;
    let onAbort = () => {};
    const finish = () => {
      if (settled) return;
      settled = true;
      abortSignal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    (timer as { unref?: () => void }).unref?.();
    onAbort = () => {
      clearTimeout(timer);
      finish();
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}
