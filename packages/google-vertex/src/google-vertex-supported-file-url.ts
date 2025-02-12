// https://firebase.google.com/docs/vertex-ai/input-file-requirements
// The definition of supported file URLs reduces to a simple protocol check as
// any publicly accessible file can be used as input.
export function isSupportedFileUrl(url: URL) {
  return ['http:', 'https:', 'gs:'].includes(url.protocol);
}
