export function prepareOutgoingHttpHeaders(
  headers: HeadersInit | undefined,
  {
    contentType,
    dataStreamVersion,
  }: { contentType: string; dataStreamVersion?: 'v1' | undefined },
) {
  const outgoingHeaders: Record<string, string | number | string[]> = {};

  if (headers != null) {
    for (const [key, value] of Object.entries(headers)) {
      outgoingHeaders[key] = value;
    }
  }

  if (outgoingHeaders['Content-Type'] == null) {
    outgoingHeaders['Content-Type'] = contentType;
  }

  if (dataStreamVersion !== undefined) {
    outgoingHeaders['X-Vercel-AI-Data-Stream'] = dataStreamVersion;
  }

  return outgoingHeaders;
}
