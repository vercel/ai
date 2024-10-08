export function splitDataUrl(dataUrl: string): {
  mimeType: string | undefined;
  base64Content: string | undefined;
} {
  try {
    const [header, base64Content] = dataUrl.split(',');
    return {
      mimeType: header.split(';')[0].split(':')[1],
      base64Content,
    };
  } catch (error) {
    return {
      mimeType: undefined,
      base64Content: undefined,
    };
  }
}
