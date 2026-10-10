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
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      await onTextPart(value);
    }
  } finally {
    if (!finished) {
      await reader.cancel().catch(() => {});
    }
    reader.releaseLock();
  }
}
