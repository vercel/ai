// https://firebase.google.com/docs/vertex-ai/input-file-requirements
export function isSupportedFileUrl(url: URL) {
  const normalizedUrl = url.toString().toLowerCase();

  // Cloud Storage URLs (both Firebase and GCP)
  if (
    normalizedUrl.startsWith('gs://') ||
    normalizedUrl.startsWith('https://storage.googleapis.com/')
  ) {
    return true;
  }

  // YouTube URLs
  if (
    normalizedUrl.startsWith('https://www.youtube.com/') ||
    normalizedUrl.startsWith('https://youtu.be/')
  ) {
    return true;
  }

  // Public HTTP/HTTPS URLs
  if (
    normalizedUrl.startsWith('http://') ||
    normalizedUrl.startsWith('https://')
  ) {
    return true;
  }

  return false;
}
