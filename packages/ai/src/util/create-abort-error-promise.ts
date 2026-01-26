export function createAbortErrorPromise(
  signal: AbortSignal | undefined,
): Promise<never> | undefined {
  if (signal == null) {
    return undefined;
  }

  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    signal.addEventListener(
      'abort',
      () => {
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
