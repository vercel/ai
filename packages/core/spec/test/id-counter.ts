/**
ID generator that counts up from 0.
 */
export function idCounter() {
  let count = 0;
  return () => String(count++);
}
