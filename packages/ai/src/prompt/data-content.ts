import { AISDKError, type LanguageModelV3DataContent } from '@ai-sdk/provider';
import {
  isUint8Array,
  isArrayBuffer,
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
  type DataContent,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { InvalidDataContentError } from './invalid-data-content-error';
import { splitDataUrl } from './split-data-url';

/**
 * @internal
 */
export const dataContentSchema: z.ZodType<DataContent> = z.union([
  z.string(),
  z.custom<Uint8Array>(isUint8Array, { message: 'Must be a Uint8Array' }),
  z.custom<ArrayBuffer>(isArrayBuffer, { message: 'Must be an ArrayBuffer' }),
  z.custom<Buffer>(
    // Buffer might not be available in some environments such as CloudFlare:
    (value: unknown): value is Buffer =>
      globalThis.Buffer?.isBuffer(value) ?? false,
    { message: 'Must be a Buffer' },
  ),
]);

export function convertToLanguageModelV3DataContent(
  content: DataContent | URL,
): {
  data: LanguageModelV3DataContent;
  mediaType: string | undefined;
  originalUrl?: string;
} {
  let originalUrl: string | undefined;

  // Buffer & Uint8Array:
  if (isUint8Array(content)) {
    return {
      data: convertDataContentToUint8Array(content),
      mediaType: undefined,
    };
  }

  // ArrayBuffer needs conversion to Uint8Array (lightweight):
  if (isArrayBuffer(content)) {
    return { data: new Uint8Array(content), mediaType: undefined };
  }

  // Attempt to create a URL from the data. If it fails, we can assume the data
  // is not a URL and likely some other sort of data.
  if (typeof content === 'string') {
    try {
      const url = new URL(content);
      originalUrl = url.toString() !== content ? content : undefined;
      content = url;
    } catch (error) {
      // ignored
    }
  }

  // Extract data from data URL:
  if (content instanceof URL && content.protocol === 'data:') {
    const { mediaType: dataUrlMediaType, base64Content } = splitDataUrl(
      content.toString(),
    );

    if (dataUrlMediaType == null || base64Content == null) {
      throw new AISDKError({
        name: 'InvalidDataContentError',
        message: `Invalid data URL format in content ${content.toString()}`,
      });
    }

    return { data: base64Content, mediaType: dataUrlMediaType };
  }

  return {
    data: content,
    mediaType: undefined,
    ...(originalUrl != null ? { originalUrl } : {}),
  };
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

/**
 * Converts a Uint8Array to a string of text.
 *
 * @param uint8Array - The Uint8Array to convert.
 * @returns The converted string.
 */
export function convertUint8ArrayToText(uint8Array: Uint8Array): string {
  try {
    return new TextDecoder().decode(uint8Array);
  } catch (error) {
    throw new Error('Error decoding Uint8Array to text');
  }
}
