export function isSupportedFileUrl(url: URL): boolean {
  return url
    .toString()
    .startsWith('https://generativelanguage.googleapis.com/v1beta/files/');
}
