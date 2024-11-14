export async function processTextStream({
  stream,
  onChunk,
}: {
  stream: ReadableStream<Uint8Array>;
  onChunk: (chunk: string) => Promise<void> | void;
}): Promise<void> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    await onChunk(value);
  }
}
