export function createAbortErrorPromise(signal: AbortSignal | undefined):
  | {
      promise: Promise<never>;
      cleanup: () => void;
    }
  | undefined {
  if (signal == null) {
    return undefined;
  }

  if (signal.aborted) {
    return {
      promise: Promise.reject(signal.reason),
      cleanup: () => {},
    };
  }

  let onAbort: (() => void) | undefined;

  const promise = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });

  const cleanup = () => {
    if (onAbort != null) {
      signal.removeEventListener('abort', onAbort);
    }
  };

  return { promise, cleanup };
}
