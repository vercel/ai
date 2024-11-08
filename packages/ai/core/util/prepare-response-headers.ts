export function prepareResponseHeaders(
  headers: HeadersInit | undefined,
  {
    contentType,
    dataStreamVersion,
  }: { contentType: string; dataStreamVersion?: 'v1' | undefined },
) {
  const responseHeaders = new Headers(headers ?? {});

  if (!responseHeaders.has('Content-Type')) {
    responseHeaders.set('Content-Type', contentType);
  }

  if (dataStreamVersion !== undefined) {
    responseHeaders.set('X-Vercel-AI-Data-Stream', dataStreamVersion);
  }

  return responseHeaders;
}
