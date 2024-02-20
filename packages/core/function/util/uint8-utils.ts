export function convertBase64ToUint8Array(base64String: string) {
  const base64Url = base64String.replace(/-/g, '+').replace(/_/g, '/');
  const latin1string = globalThis.atob(base64Url);
  return Uint8Array.from(latin1string, byte => byte.codePointAt(0)!);
}

export function convertUint8ArrayToBase64(array: Uint8Array): string {
  let latin1string = '';
  for (const value of array) {
    latin1string += String.fromCodePoint(value);
  }
  return globalThis.btoa(latin1string);
}
