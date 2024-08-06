/**
 * Consumes a ReadableStream until it's fully read.
 *
 * This function reads the stream chunk by chunk until the stream is exhausted.
 * It doesn't process or return the data from the stream; it simply ensures
 * that the entire stream is read.
 *
 * @param {ReadableStream} stream - The ReadableStream to be consumed.
 * @returns {Promise<void>} A promise that resolves when the stream is fully consumed.
 */
export async function consumeStream(stream: ReadableStream): Promise<void> {
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}
