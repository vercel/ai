import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
  type DataContent,
} from '@ai-sdk/provider-utils';
import { InvalidDataContentError } from './invalid-data-content-error';

function isUint8Array(value: unknown): value is Uint8Array {
  return (
    value instanceof Uint8Array ||
    (typeof value === 'object' &&
      value !== null &&
      (value.constructor?.name === 'Uint8Array' ||
        Object.prototype.toString.call(value) === '[object Uint8Array]'))
  );
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return (
    value instanceof ArrayBuffer ||
    (typeof value === 'object' &&
      value !== null &&
      (value.constructor?.name === 'ArrayBuffer' ||
        Object.prototype.toString.call(value) === '[object ArrayBuffer]'))
  );
}

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

  if (isArrayBuffer(content)) {
    return convertUint8ArrayToBase64(new Uint8Array(content));
  }

  if (isUint8Array(content)) {
    return convertUint8ArrayToBase64(
      content instanceof Uint8Array
        ? content
        : new Uint8Array(content.buffer, content.byteOffset, content.byteLength),
    );
  }

  return convertUint8ArrayToBase64(content);
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
    return content instanceof Uint8Array
      ? content
      : new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
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
