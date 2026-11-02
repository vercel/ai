// btoa and atob need to be invoked as a function call, not as a method call.
// Otherwise CloudFlare will throw a
// "TypeError: Illegal invocation: function called with incorrect this reference"
const { btoa, atob } = globalThis;

export function convertBase64ToUint8Array(
  base64String: string,
): Uint8Array<ArrayBuffer> {
  const base64 = base64String.replace(/-/g, '+').replace(/_/g, '/');

  // Uint8Array.fromBase64 is quicker but is only available on Node.js 25+
  const { fromBase64 } = Uint8Array as {
    fromBase64?: (base64: string) => Uint8Array<ArrayBuffer>;
  };
  if (typeof fromBase64 === 'function') {
    return fromBase64.call(Uint8Array, base64);
  }

  // Fill a preallocated array instead of using Uint8Array.from(string, mapFn),
  // which iterates per character and needs ~25x the decoded size in memory:
  const latin1string = atob(base64);
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

export function convertToBase64(value: string | Uint8Array): string {
  return value instanceof Uint8Array ? convertUint8ArrayToBase64(value) : value;
}
