import { createTextDecoderStream } from '@ai-sdk/provider-utils';

export async function processTextStream({
  stream,
  onTextPart,
}: {
  stream: ReadableStream<Uint8Array>;
  onTextPart: (chunk: string) => Promise<void> | void;
}): Promise<void> {
  const reader = stream.pipeThrough(createTextDecoderStream()).getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    await onTextPart(value);
  }
}
