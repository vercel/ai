// btoa and atob need to be invoked as a function call, not as a method call.
// Otherwise CloudFlare will throw a
// "TypeError: Illegal invocation: function called with incorrect this reference"
const { btoa, atob } = globalThis;

export function convertBase64ToUint8Array(base64String: string) {
  const base64Url = base64String.replace(/-/g, '+').replace(/_/g, '/');
  const latin1string = atob(base64Url);

  // Preallocate and fill: `Uint8Array.from(string, mapFn)` iterates per
  // character and collects the mapped values before allocating the result,
  // which peaks at ~25x the decoded size and blocks for ~1s on 20 MB inputs.
  const bytes = new Uint8Array(latin1string.length);
  for (let i = 0; i < latin1string.length; i++) {
    bytes[i] = latin1string.charCodeAt(i);
  }
  return bytes;
}

export function convertUint8ArrayToBase64(array: Uint8Array): string {
  if (typeof globalThis.Buffer?.from === 'function') {
    return globalThis.Buffer.from(
      array.buffer,
      array.byteOffset,
      array.byteLength,
    ).toString('base64');
  }

  const chunks: string[] = [];
  const chunkSize = 4096;

  // Note: regular for loop to support older JavaScript versions that
  // do not support for..of on Uint8Array
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(String.fromCodePoint(...array.subarray(i, i + chunkSize)));
  }

  return btoa(chunks.join(''));
}

// Intrinsic getters check the built-in slots across realms without relying on
// constructor names or user-defined Symbol.toStringTag properties.
const typedArrayTag = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag,
)!.get!;
const arrayBufferByteLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'byteLength',
)!.get!;

export function isUint8Array(value: unknown): value is Uint8Array {
  return (
    ArrayBuffer.isView(value) && typedArrayTag.call(value) === 'Uint8Array'
  );
}

export function isArrayBuffer(value: unknown): value is ArrayBuffer {
  if (typeof value !== 'object' || value === null || !('byteLength' in value)) {
    return false;
  }
  try {
    arrayBufferByteLength.call(value);
    return true;
  } catch {
    return false;
  }
}

export function convertToBase64(value: string | Uint8Array): string {
  return isUint8Array(value) ? convertUint8ArrayToBase64(value) : value;
}
