import { readFile } from 'node:fs/promises';

/**
 * Reads a file of raw audio bytes and returns a `ReadableStream` of fixed-size
 * chunks, optionally pacing each chunk to simulate a live microphone feed.
 *
 * `experimental_streamTranscribe` expects a stream of raw audio chunks whose
 * encoding matches the `inputAudioFormat` you pass alongside it (e.g. signed
 * 16-bit little-endian PCM for `audio/pcm`). This helper does NOT transcode --
 * point it at a file that is already in the target raw format (for example a
 * headerless PCM capture, or a `.wav` with the 44-byte header stripped).
 *
 * @param path - Path to the raw audio file.
 * @param chunkSize - Bytes per chunk (default 3200 = 100ms of 16kHz s16 mono).
 * @param realtime - When true, delay between chunks based on `bytesPerSecond`
 *   so the stream is emitted at roughly playback speed.
 * @param bytesPerSecond - Used with `realtime` to pace chunk emission.
 */
export function createAudioFileStream({
  path,
  chunkSize = 3200,
  realtime = false,
  bytesPerSecond = 32000,
  skipBytes = 0,
}: {
  path: string;
  chunkSize?: number;
  realtime?: boolean;
  bytesPerSecond?: number;
  skipBytes?: number;
}): ReadableStream<Uint8Array> {
  let bytes: Uint8Array | undefined;
  let offset = 0;

  const chunkDurationMs = realtime ? (chunkSize / bytesPerSecond) * 1000 : 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (bytes == null) {
        const file = await readFile(path);
        bytes = new Uint8Array(
          file.buffer,
          file.byteOffset,
          file.byteLength,
        ).subarray(skipBytes);
      }

      if (offset >= bytes.length) {
        controller.close();
        return;
      }

      if (chunkDurationMs > 0) {
        await new Promise(resolve => setTimeout(resolve, chunkDurationMs));
      }

      const end = Math.min(offset + chunkSize, bytes.length);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
  });
}
