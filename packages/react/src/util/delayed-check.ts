export const createDelayedCheck = (
  fn: () => Promise<void> | void,
  delay: number | undefined,
) => {
  if (delay) {
    return () => setTimeout(fn, delay + 50);
  }
  return fn;
};
