export async function processTextStream({
  reader,
  isAborted,
  onChunk,
}: {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  isAborted: () => boolean;
  onChunk: (chunk: string) => void;
}) {
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    onChunk(decoder.decode(value, { stream: true }));

    // The request has been aborted, stop reading the stream.
    if (isAborted()) {
      reader.cancel();
      break;
    }
  }
}
