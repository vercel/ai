import {InvalidDataContentError} from './invalid-data-content-error';

export function splitDataUrl(dataUrl: string): {
  mediaType: string | undefined;
  base64Content: string | undefined;
  isBase64: boolean;
} {
  try {
    // Split at the first comma only: the content may itself contain commas
    // (e.g. CSV data) which are part of the payload, not separators.
    const firstCommaIndex = dataUrl.indexOf(',');

    if (firstCommaIndex === -1) {
      return {
        mediaType: undefined,
        base64Content: undefined,
        isBase64: false,
      };
    }

    const header = dataUrl.slice(0, firstCommaIndex);

    return {
      mediaType: header.split(';')[0].split(':')[1],
      base64Content: dataUrl.slice(firstCommaIndex + 1),
      // Per RFC 2397, the content is base64 only when the header carries
      // the ';base64' marker; otherwise it is percent-encoded.
      isBase64: /;base64$/i.test(header),
    };
  } catch {
    return {
      mediaType: undefined,
      base64Content: undefined,
      isBase64: false,
    };
  }
}

/**
 * Decodes the percent-encoded content of a data URL without the ';base64'
 * marker (RFC 2397) into bytes.
 *
 * Every %XX escape becomes a single byte, so content that is not valid UTF-8
 * (e.g. binary data or a different charset) is preserved. Literal characters
 * are encoded as UTF-8.
 *
 * Throws a URIError when the content contains invalid percent-encoding.
 */
export function decodePercentEncodedContent(content: string): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();

  for (let i = 0; i < content.length; ) {
    const char = content[i]!;

    if (char === '%') {
      const hex = content.slice(i + 1, i + 3);

      if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
        throw new URIError('Invalid percent-encoding in data URL content');
      }

      bytes.push(parseInt(hex, 16));
      i += 3;
      continue;
    }

    // Encode literal characters as UTF-8, keeping surrogate pairs
    // (non-BMP characters) together.
    const chunk = String.fromCodePoint(content.codePointAt(i)!);
    bytes.push(...encoder.encode(chunk));
    i += chunk.length;
  }

  return Uint8Array.from(bytes);
}

/**
 * Decodes the percent-encoded content of a non-base64 data URL (RFC 2397)
 * into bytes, throwing an InvalidDataContentError when the content contains
 * invalid percent-encoding.
 */
export function decodeNonBase64DataUrlContent(
  content: string,
  dataUrl: string,
): Uint8Array {
  try {
    return decodePercentEncodedContent(content);
  } catch (error) {
    throw new InvalidDataContentError({
      content: dataUrl,
      cause: error,
      message: `Invalid percent-encoding in data URL content ${dataUrl}`,
    });
  }
}
