export function createPacedAudioStream({
  bytes,
  sampleRate,
  chunkDurationMs,
}: {
  bytes: Uint8Array;
  sampleRate: number;
  chunkDurationMs: number;
}) {
  const bytesPerPcm16Sample = 2;
  const chunkSize = sampleRate * bytesPerPcm16Sample * (chunkDurationMs / 1000);
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }

      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;

      await new Promise(resolve => setTimeout(resolve, chunkDurationMs));
    },
  });
}
