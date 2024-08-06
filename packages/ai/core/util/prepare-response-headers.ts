export function prepareResponseHeaders(
  init: ResponseInit | undefined,
  {
    contentType,
    dataStreamVersion,
  }: { contentType: string; dataStreamVersion?: 'v1' | undefined },
) {
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', contentType);
  }

  if (dataStreamVersion !== undefined) {
    headers.set('X-Vercel-AI-Data-Stream', dataStreamVersion);
  }

  return headers;
}
