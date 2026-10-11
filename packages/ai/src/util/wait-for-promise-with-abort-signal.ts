export async function waitForPromiseWithAbortSignal<T>({
  promise,
  abortSignal,
}: {
  promise: PromiseLike<T>;
  abortSignal: AbortSignal | undefined;
}): Promise<T> {
  if (abortSignal == null) {
    return await promise;
  }

  return await new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      abortSignal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(abortSignal.reason);
    };

    Promise.resolve(promise)
      .then(value => {
        cleanup();
        resolve(value);
      })
      .catch(error => {
        cleanup();
        reject(error);
      });

    abortSignal.addEventListener('abort', onAbort, { once: true });

    if (abortSignal.aborted) {
      onAbort();
    }
  });
}
