export function prepareOutgoingHttpHeaders(
  init: ResponseInit | undefined,
  {
    contentType,
    dataStreamVersion,
  }: { contentType: string; dataStreamVersion?: 'v1' | undefined },
) {
  const headers: Record<string, string | number | string[]> = {};

  if (init?.headers != null) {
    for (const [key, value] of Object.entries(init.headers)) {
      headers[key] = value;
    }
  }

  if (headers['Content-Type'] == null) {
    headers['Content-Type'] = contentType;
  }

  if (dataStreamVersion !== undefined) {
    headers['X-Vercel-AI-Data-Stream'] = dataStreamVersion;
  }

  return headers;
}
