/**
 * Creates a Promise that resolves after a specified delay
 * @param delayInMs - The delay duration in milliseconds. If null or undefined, resolves immediately.
 * @returns A Promise that resolves after the specified delay
 */
export async function delay(delayInMs?: number | null): Promise<void> {
  return delayInMs == null
    ? Promise.resolve()
    : new Promise(resolve => setTimeout(resolve, delayInMs));
}
