export function prepareResponseHeaders(
  init: ResponseInit | undefined,
  { contentType }: { contentType: string },
) {
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', contentType);
  }

  return headers;
}
