import { InvalidArgumentError } from '../error/invalid-argument-error';

/**
 * Converts a data URL of type text/* to a text string.
 *
 * @throws {InvalidArgumentError} If the data URL is malformed or cannot be decoded.
 */
export function getTextFromDataUrl(dataUrl: string): string {
  const [header, base64Content] = dataUrl.split(',');
  const mediaType = header.split(';')[0].split(':')[1];

  if (mediaType == null || base64Content == null) {
    throw new InvalidArgumentError({
      parameter: 'dataUrl',
      value: dataUrl,
      message: 'Invalid data URL format',
    });
  }

  try {
    return window.atob(base64Content);
  } catch {
    throw new InvalidArgumentError({
      parameter: 'dataUrl',
      value: dataUrl,
      message: 'Error decoding data URL',
    });
  }
}
