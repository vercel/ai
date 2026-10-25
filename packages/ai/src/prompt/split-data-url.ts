export function splitDataUrl(dataUrl: string): {
  mediaType: string | undefined;
  base64Content: string | undefined;
} {
  try {
    const firstCommaIndex = dataUrl.indexOf(',');
    if (firstCommaIndex === -1) {
      return {
        mediaType: undefined,
        base64Content: undefined,
      };
    }

    const header = dataUrl.slice(0, firstCommaIndex);
    const base64Content = dataUrl.slice(firstCommaIndex + 1);

    const colonIndex = header.indexOf(':');
    if (colonIndex === -1) {
      return {
        mediaType: undefined,
        base64Content: undefined,
      };
    }

    const mediaTypePart = header.slice(colonIndex + 1).split(';')[0].trim();
    const mediaType = mediaTypePart === '' ? undefined : mediaTypePart;

    return {
      mediaType,
      base64Content,
    };
  } catch {
    return {
      mediaType: undefined,
      base64Content: undefined,
    };
  }
}
