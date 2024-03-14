import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from '../../ai-model-specification';

/**
 * Data content. Can either be a base64-encoded string, a Uint8Array, an ArrayBuffer, or a Buffer.
 */
export type DataContent = string | Uint8Array | ArrayBuffer | Buffer;

export function convertDataContentToBase64String(content: DataContent): string {
  if (typeof content === 'string') {
    return content;
  }

  if (content instanceof ArrayBuffer) {
    return convertUint8ArrayToBase64(new Uint8Array(content));
  }

  return convertUint8ArrayToBase64(content);
}

export function convertDataContentToUint8Array(
  content: DataContent,
): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }

  if (typeof content === 'string') {
    return convertBase64ToUint8Array(content);
  }

  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }

  throw new Error(
    `Invalid data content. Expected a string, Uint8Array, ArrayBuffer, or Buffer, but got ${typeof content}.`,
  );
}
