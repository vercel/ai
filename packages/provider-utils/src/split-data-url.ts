/**
 * Splits a data URL into its media type and base64 content components.
 *
 * @param dataUrl - The data URL to split (e.g., "data:image/png;base64,iVBORw0...")
 * @returns An object containing the mediaType and base64Content, or undefined values if parsing fails
 */
export function splitDataUrl(dataUrl: string): {
  mediaType: string | undefined;
  base64Content: string | undefined;
} {
  const undefinedResult = {
    mediaType: undefined,
    base64Content: undefined,
  };

  // Check if it's a valid data URL
  if (!dataUrl.startsWith('data:')) {
    return undefinedResult;
  }

  try {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) {
      return undefinedResult;
    }
    const header = dataUrl.substring(0, commaIndex);
    const base64Content = dataUrl.substring(commaIndex + 1);

    // Validate header format
    if (!header.includes(';base64')) {
      return undefinedResult;
    }

    const mediaType = header.split(';')[0].split(':')[1];

    // Ensure we got a valid media type
    if (!mediaType) {
      return undefinedResult;
    }

    return {
      mediaType,
      base64Content,
    };
  } catch (error) {
    return undefinedResult;
  }
}
