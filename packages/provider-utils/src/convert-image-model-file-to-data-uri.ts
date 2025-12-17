import { ImageModelV3File } from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from './uint8-utils';

/**
 * Convert an ImageModelV3File to a URL or data URI string.
 *
 * If the file is a URL, it returns the URL as-is.
 * If the file is base64 data, it returns a data URI with the base64 data.
 * If the file is a Uint8Array, it converts it to base64 and returns a data URI.
 */
export function convertImageModelFileToDataUri(file: ImageModelV3File): string {
  if (file.type === 'url') {
    return file.url;
  }

  // file.type === 'file' - data can be base64 string or Uint8Array
  if (typeof file.data === 'string') {
    // Already base64 encoded
    return `data:${file.mediaType};base64,${file.data}`;
  }

  // Uint8Array - convert to base64
  const base64 = convertUint8ArrayToBase64(file.data);
  return `data:${file.mediaType};base64,${base64}`;
}
