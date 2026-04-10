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
