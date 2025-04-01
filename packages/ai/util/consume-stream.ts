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
  const transformStream = new TransformStream();
  const writer = transformStream.writable.getWriter();
  const reader = stream.getReader();

  try {
    while (true) {
      try {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      } catch (error) {
        // Ignore abort errors, continue reading:
        if (
          error instanceof Error &&
          error.name !== 'AbortError' &&
          error.name !== 'ResponseAborted'
        ) {
          throw error;
        }
      }
    }
  } finally {
    reader.releaseLock();
    writer.close();
  }
}
