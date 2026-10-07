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
