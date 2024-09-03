export function mockNow(values: number[]): () => number {
  let counter = 0;
  return () => values[counter++] ?? values[values.length - 1];
}
