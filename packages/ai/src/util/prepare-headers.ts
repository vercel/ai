export function prepareHeaders(
  headers: HeadersInit | undefined,
  defaultHeaders: Record<string, string>,
): Headers {
  const responseHeaders = new Headers(headers ?? {});

  for (const [key, value] of Object.entries(defaultHeaders)) {
    if (!responseHeaders.has(key)) {
      responseHeaders.set(key, value);
    }
  }

  return responseHeaders;
}

export function prepareNodeResponseHeaders(
  headers: HeadersInit | undefined,
  defaultHeaders: Record<string, string>,
): Record<string, string | string[]> {
  const preparedHeaders = prepareHeaders(headers, defaultHeaders);
  const nodeHeaders: Record<string, string | string[]> = Object.fromEntries(
    preparedHeaders.entries(),
  );
  const setCookieHeaders = preparedHeaders.getSetCookie();

  if (setCookieHeaders.length > 0) {
    nodeHeaders['set-cookie'] = setCookieHeaders;
  }

  return nodeHeaders;
}
