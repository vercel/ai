// btoa and atob need to be invoked as a function call, not as a method call.
// Otherwise CloudFlare will throw a
// "TypeError: Illegal invocation: function called with incorrect this reference"
const { btoa, atob } = globalThis;

export function convertBase64ToUint8Array(base64String: string) {
  const base64Url = base64String.replace(/-/g, '+').replace(/_/g, '/');
  const latin1string = atob(base64Url);
  return Uint8Array.from(latin1string, byte => byte.codePointAt(0)!);
}

export function convertUint8ArrayToBase64(array: Uint8Array): string {
  // Use chunked encoding to avoid OOM on large arrays.
  // String.fromCodePoint concatenation per byte creates a cons-string rope
  // that V8 cannot collect until btoa flattens it, causing high memory usage.
  const chunkSize = 8192;
  let latin1string = '';

  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.subarray(i, i + chunkSize);
    latin1string += String.fromCodePoint.apply(null, chunk as any);
  }

  return btoa(latin1string);
}

export function convertToBase64(value: string | Uint8Array): string {
  return value instanceof Uint8Array ? convertUint8ArrayToBase64(value) : value;
}
