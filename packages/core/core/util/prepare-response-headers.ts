export function prepareResponseHeaders(
  init: ResponseInit | undefined,
  {
    contentType,
    aiStreamVersion,
  }: { contentType: string; aiStreamVersion?: string | undefined },
) {
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', contentType);
  }

  if (aiStreamVersion !== undefined) {
    headers.set('X-Vercel-AI-Stream', aiStreamVersion);
  }

  return headers;
}
