export async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

export function sliceTextLines({
  text,
  startLine,
  endLine,
}: {
  text: string;
  startLine?: number;
  endLine?: number;
}): string {
  if (startLine == null && endLine == null) return text;
  const lines = text.split('\n');
  const start = Math.max(1, startLine ?? 1) - 1;
  const end = Math.min(lines.length, endLine ?? lines.length);
  return lines.slice(start, end).join('\n');
}
