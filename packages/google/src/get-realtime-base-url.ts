/**
 * Returns the base URL for Live API (WebSocket) endpoints, stripping a
 * trailing `/v1beta` or `/v1alpha` API version segment: Live API paths carry
 * their own version and are not nested under it.
 */
export function getRealtimeBaseURL(baseURL: string): URL {
  const url = new URL(baseURL);
  const pathSegments = url.pathname.split('/');
  const version = pathSegments.at(-1);

  if (version === 'v1beta' || version === 'v1alpha') {
    pathSegments.pop();
    url.pathname = pathSegments.join('/') || '/';
  }

  return url;
}

/**
 * Builds a `wss://` Live API WebSocket URL for the given bidi service path
 * (e.g. `google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`).
 */
export function getRealtimeWebSocketURL(
  baseURL: string,
  webSocketPath: string,
): URL {
  const url = getRealtimeBaseURL(baseURL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/ws/${webSocketPath}`;
  return url;
}
