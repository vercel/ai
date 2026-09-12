/**
 * Creates a transform stream that decodes Uint8Array chunks to strings.
 *
 * Uses the native `TextDecoderStream` when available. In environments that
 * lack it (notably React Native / Expo), falls back to a `TransformStream`
 * backed by `TextDecoder`.
 */
export function createTextDecoderStream(): ReadableWritablePair<
  string,
  Uint8Array
> {
  if (typeof TextDecoderStream !== 'undefined') {
    return new TextDecoderStream();
  }

  const decoder = new TextDecoder();

  return new TransformStream<Uint8Array, string>({
    transform(chunk, controller) {
      controller.enqueue(decoder.decode(chunk, { stream: true }));
    },
    flush(controller) {
      const remaining = decoder.decode();
      if (remaining.length > 0) {
        controller.enqueue(remaining);
      }
    },
  });
}
