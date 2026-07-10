// btoa and atob need to be invoked as a function call, not as a method call.
// Otherwise CloudFlare will throw a
// "TypeError: Illegal invocation: function called with incorrect this reference"
const { btoa, atob } = globalThis;

/**
 * Creates a transform stream that decodes binary chunks into strings.
 *
 * Unlike `TextDecoderStream`, this accepts shared buffer sources, matching the
 * input supported by `TextDecoder.decode`.
 */
export function createTextDecoderStream(): TransformStream<
  AllowSharedBufferSource,
  string
> {
  const decoder = new TextDecoder();

  return new TransformStream<AllowSharedBufferSource, string>({
    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true });
      if (text.length > 0) {
        controller.enqueue(text);
      }
    },
    flush(controller) {
      const text = decoder.decode();
      if (text.length > 0) {
        controller.enqueue(text);
      }
    },
  });
}

/**
 * Returns a Uint8Array backed by an ArrayBuffer.
 *
 * Creates a new view without copying when the input is already backed by an
 * ArrayBuffer. SharedArrayBuffer-backed and cross-realm inputs are copied into
 * a new ArrayBuffer.
 */
export function toArrayBufferBackedUint8Array(
  value: Uint8Array,
): Uint8Array<ArrayBuffer> {
  return value.buffer instanceof ArrayBuffer
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value);
}

export function convertBase64ToUint8Array(base64String: string) {
  const base64Url = base64String.replace(/-/g, '+').replace(/_/g, '/');
  const latin1string = atob(base64Url);
  return Uint8Array.from(latin1string, byte => byte.codePointAt(0)!);
}

export function convertUint8ArrayToBase64(array: Uint8Array): string {
  let latin1string = '';

  // Note: regular for loop to support older JavaScript versions that
  // do not support for..of on Uint8Array
  for (let i = 0; i < array.length; i++) {
    latin1string += String.fromCodePoint(array[i]);
  }

  return btoa(latin1string);
}

export function convertToBase64(value: string | Uint8Array): string {
  return value instanceof Uint8Array ? convertUint8ArrayToBase64(value) : value;
}
