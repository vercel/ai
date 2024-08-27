export async function delay(delayInMs?: number): Promise<void> {
  return delayInMs === undefined
    ? Promise.resolve()
    : new Promise(resolve => setTimeout(resolve, delayInMs));
}
