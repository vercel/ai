/**
 * Shared WebSocket subprotocol contract for AI Gateway realtime auth.
 *
 * The browser `WebSocket` API cannot set request headers, so the Gateway auth
 * (bearer) token is carried through the `Sec-WebSocket-Protocol` handshake
 * instead of an `Authorization` header — the same workaround OpenAI uses for
 * `openai-insecure-api-key.<token>`.
 *
 * This module is the single source of truth for that contract so the client and
 * the Gateway server can't drift: the client encodes the token with
 * `getGatewayRealtimeProtocols`, and the Gateway server decodes it with
 * `getGatewayRealtimeAuthToken`.
 */

/**
 * Marker subprotocol offered on every handshake so the Gateway can echo a
 * negotiated subprotocol on the 101 response (some clients require the server to
 * select one of the offered subprotocols).
 */
export const GATEWAY_REALTIME_SUBPROTOCOL = 'ai-gateway-realtime';

/** Subprotocol prefix that carries the Gateway auth (bearer) token. */
export const GATEWAY_AUTH_SUBPROTOCOL_PREFIX = 'ai-gateway-auth.';

/**
 * Client-side: build the WebSocket subprotocols that carry `token` to the
 * Gateway. Pass the result as the second argument to `new WebSocket(url, ...)`.
 */
export function getGatewayRealtimeProtocols(token: string): string[] {
  return [
    GATEWAY_REALTIME_SUBPROTOCOL,
    `${GATEWAY_AUTH_SUBPROTOCOL_PREFIX}${token}`,
  ];
}

/**
 * Server-side: extract the Gateway auth (bearer) token from a
 * `Sec-WebSocket-Protocol` header value, or `undefined` when it is absent or
 * empty. The Gateway upgrade handler turns this into an
 * `Authorization: Bearer <token>` before its normal auth path.
 *
 * Accepts the raw header value (subprotocols are comma-separated and may carry
 * surrounding whitespace).
 */
export function getGatewayRealtimeAuthToken(
  secWebSocketProtocol: string | null | undefined,
): string | undefined {
  const authProtocol = secWebSocketProtocol
    ?.split(',')
    .map(protocol => protocol.trim())
    .find(protocol => protocol.startsWith(GATEWAY_AUTH_SUBPROTOCOL_PREFIX));

  // `authProtocol` is already trimmed above, so the sliced token needs no
  // further trimming; `|| undefined` collapses the empty-token case.
  const token = authProtocol?.slice(GATEWAY_AUTH_SUBPROTOCOL_PREFIX.length);

  return token || undefined;
}
