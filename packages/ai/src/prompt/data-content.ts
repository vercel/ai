import {
  isUint8Array,
  isArrayBuffer,
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
  type DataContent,
} from '@ai-sdk/provider-utils';
import { InvalidDataContentError } from './invalid-data-content-error';

/**
 * Converts data content to a base64-encoded string.
 *
 * @param content - Data content to convert.
 * @returns Base64-encoded string.
 */
export function convertDataContentToBase64String(content: DataContent): string {
  if (typeof content === 'string') {
    return content;
  }

  return convertUint8ArrayToBase64(convertDataContentToUint8Array(content));
}

/**
 * Converts data content to a Uint8Array.
 *
 * @param content - Data content to convert.
 * @returns Uint8Array.
 */
export function convertDataContentToUint8Array(
  content: DataContent,
): Uint8Array {
  if (isUint8Array(content)) {
    if (content instanceof Uint8Array) {
      return content;
    }
    const { buffer, byteOffset, byteLength } = content;
    return new Uint8Array(buffer, byteOffset, byteLength);
  }

  if (typeof content === 'string') {
    try {
      return convertBase64ToUint8Array(content);
    } catch (error) {
      throw new InvalidDataContentError({
        message:
          'Invalid data content. Content string is not a base64-encoded media.',
        content,
        cause: error,
      });
    }
  }

  if (isArrayBuffer(content)) {
    return new Uint8Array(content);
  }

  throw new InvalidDataContentError({ content });
}
