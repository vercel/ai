export const supportedFileUrlPattern = /^[a-z][a-z0-9+.-]*:/i;

export function isSupportedFileUrl(url: URL): boolean {
  return supportedFileUrlPattern.test(url.toString());
}
