export async function convertStreamToArray<T>(
  stream: ReadableStream<T>,
): Promise<T[]> {
  const result: T[] = [];

  const reader = stream.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    result.push(value);
  }

  return result;
}
