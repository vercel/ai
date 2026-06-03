/**
 * The host-side proxy handler seam. Ported from the proxy parts of
 * `agent-harness-sdk/packages/core/src/sandbox-runtime-host-controls.ts`,
 * reduced to the substrate this tool needs: forward or intercept, allow CONNECT.
 *
 * The policy/observability/secret-injection logic the original layered here is
 * out of scope (see §30 of KEY_REQUIREMENTS_AND_GAPS.md).
 */

/** Handles a proxied HTTP request from the sandbox. */
export type HttpHandler = (request: Request) => Response | Promise<Response>;

/** Decides whether to allow an HTTPS CONNECT tunnel. */
export type ConnectHandler = (host: string) => boolean | Promise<boolean>;

/** Allow every CONNECT tunnel — the substrate does no host policy. */
export const allowAllConnectHandler: ConnectHandler = () => true;

/**
 * The interception seam, identical to the original's
 * `httpHandler != null ? httpHandler(req) : fetch(req)`. When a handler is
 * supplied (record or replay) it fully owns the response and the live network is
 * never touched; otherwise requests pass through to `fetch`. Replay plugs in
 * here by supplying a fixture-reading handler.
 */
export function resolveHttpHandler(httpHandler?: HttpHandler): HttpHandler {
  return httpHandler != null
    ? (request: Request) => httpHandler(request)
    : (request: Request) => fetch(request);
}
