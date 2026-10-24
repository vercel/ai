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
      // the ';base64' marker; otherwise it is percent-encoded text.
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
 * marker (RFC 2397) into bytes, so providers receive the actual content.
 *
 * Throws a URIError when the content contains invalid percent-encoding.
 */
export function decodePercentEncodedContent(content: string): Uint8Array {
  return new TextEncoder().encode(decodeURIComponent(content));
}
