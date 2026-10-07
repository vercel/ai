export async function processTextStream({
  stream,
  onTextPart,
}: {
  stream: ReadableStream<Uint8Array>;
  onTextPart: (chunk: string) => Promise<void> | void;
}): Promise<void> {
  const reader = stream
    .pipeThrough(
      new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>,
    )
    .getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    await onTextPart(value);
  }
}
