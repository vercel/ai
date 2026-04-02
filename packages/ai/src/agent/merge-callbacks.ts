/**
 * Merges two optional callbacks into one that calls both sequentially.
 * The first callback (from constructor/settings) runs before the second (from method).
 */
export function mergeCallbacks<
  T extends (event: any) => PromiseLike<void> | void,
>(
  settingsCallback: T | undefined,
  methodCallback: T | undefined,
): T | undefined {
  if (methodCallback && settingsCallback) {
    return (async (event: Parameters<T>[0]) => {
      await settingsCallback(event);
      await methodCallback(event);
    }) as unknown as T;
  }
  return methodCallback ?? settingsCallback;
}
