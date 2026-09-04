/**
 * Converts a data URL of type text/* to a text string.
 */
export function getTextFromDataUrl(dataUrl: string): string {
  const [header, base64Content] = dataUrl.split(',');
  const mediaType = header.split(';')[0].split(':')[1];

  if (mediaType == null || base64Content == null) {
    throw new Error('Invalid data URL format');
  }

  try {
<<<<<<< HEAD
    return window.atob(base64Content);
  } catch (error) {
=======
    return globalThis.atob(base64Content);
  } catch {
>>>>>>> 8cdb2a79bf (fix: decode valid text data URLs in Node.js (#20354))
    throw new Error(`Error decoding data URL`);
  }
}
