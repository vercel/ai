/**
 * WebSocket protocol spoken between the host and the in-sandbox Go proxy
 * (`vc-http-proxy-server`). Ported verbatim (proxy + session-management subset)
 * from `agent-harness-sdk/packages/ws-proxy/src/protocol.ts`. The agent-event
 * and agent-control message families that shared the original's multiplexed
 * socket are intentionally dropped — in this reimplementation the agent bridge
 * has its own dedicated channel, so this socket carries proxy traffic only.
 *
 * The protocol version and message shapes must match the vendored Go binary
 * exactly; the binary is not modified.
 *
 * All messages are JSON text frames dispatched on a `type` field.
 */

export const PROXY_PROTOCOL_VERSION = '2';

// ---------------------------------------------------------------------------
// HTTP proxy (sandbox → host → sandbox)
// ---------------------------------------------------------------------------

/** Sandbox asks the host to handle an HTTP request. */
export interface HttpRequest {
  type: 'http-request';
  requestId: string;
  sessionId: string;
  method: string;
  url: string;
  headers: Record<string, string[]>;
  body?: string; // base64
}

/** Host responds with an HTTP response. */
export interface HttpResponse {
  type: 'http-response';
  requestId: string;
  status: number;
  headers?: Record<string, string[]>;
  body?: string; // base64
}

/** Sandbox asks whether an HTTPS CONNECT tunnel should be allowed. */
export interface ConnectRequest {
  type: 'connect-request';
  requestId: string;
  sessionId: string;
  host: string;
}

/** Host allows or denies the CONNECT tunnel. */
export interface ConnectResponse {
  type: 'connect-response';
  requestId: string;
  allow: boolean;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

/** Host registers proxy sessions (sessionId + token from the HTTP_PROXY URL). */
export interface Register {
  type: 'register';
  sessions: Array<{ sessionId: string; token: string }>;
}

/** Host unregisters proxy sessions. */
export interface Unregister {
  type: 'unregister';
  sessionIds: string[];
}

/** Host signals it is ready (handshake). */
export interface Ready {
  type: 'ready';
}

/** Sandbox acknowledges the ready handshake and advertises its protocol version. */
export interface ReadyAck {
  type: 'ready-ack';
  version: string;
}

/** Sandbox acknowledges session registration. */
export interface RegisterAck {
  type: 'register-ack';
  sessions: Array<{ sessionId: string }>;
  sessionIds?: string[];
}

/** Per-request error in either direction. */
export interface RequestError {
  type: 'request-error';
  requestId: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Unions
// ---------------------------------------------------------------------------

/**
 * Messages from sandbox → host. The Go binary emits the legacy short aliases
 * `request` / `connect` (not `http-request` / `connect-request`); both forms are
 * accepted because the vendored binary is not modified.
 */
export type SandboxToHost =
  | HttpRequest
  | ConnectRequest
  | (Omit<HttpRequest, 'type'> & { type: 'request' })
  | (Omit<ConnectRequest, 'type'> & { type: 'connect' })
  | ReadyAck
  | RegisterAck;

/**
 * Messages from host → sandbox. The Go binary expects the HTTP response framed
 * as `response` (not `http-response`) and per-request errors as `error`.
 */
export type HostToSandbox =
  | HttpResponse
  | (Omit<HttpResponse, 'type'> & { type: 'response' })
  | ConnectResponse
  | Register
  | Unregister
  | Ready
  | RequestError
  | (Omit<RequestError, 'type'> & { type: 'error' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert an `HttpRequest` message into a standard `Request`. */
export function toRequest(msg: HttpRequest): Request {
  const headers = new Headers();
  for (const [key, values] of Object.entries(msg.headers)) {
    for (const value of values) {
      headers.append(key, value);
    }
  }

  let body: BodyInit | undefined;
  if (msg.body) {
    body = Buffer.from(msg.body, 'base64');
  }

  return new Request(msg.url, {
    method: msg.method,
    headers,
    body: msg.method !== 'GET' && msg.method !== 'HEAD' ? body : undefined,
  });
}

/** Convert a standard `Response` into an `HttpResponse` message. */
export async function fromResponse(
  requestId: string,
  response: Response,
): Promise<HttpResponse> {
  const headers: Record<string, string[]> = {};
  response.headers.forEach((value, key) => {
    if (!headers[key]) headers[key] = [];
    headers[key].push(value);
  });

  let body: string | undefined;
  const buf = await response.arrayBuffer();
  if (buf.byteLength > 0) {
    body = Buffer.from(buf).toString('base64');
  }

  return {
    type: 'http-response',
    requestId,
    status: response.status,
    headers,
    body,
  };
}
