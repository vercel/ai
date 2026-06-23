---
'@ai-sdk/gateway': patch
---

feat(gateway): mint short-lived client secrets for experimental realtime

`gateway.experimental_realtime.getToken()` now mints a single-use, short-lived
client secret (`vcst_`) via the Gateway's `POST /v1/realtime/client-secrets`
endpoint instead of returning the long-lived Gateway credential. The customer's
server calls `getToken()` and hands the returned token to the browser, which
opens the realtime WebSocket with it through the existing
`ai-gateway-auth.<token>` subprotocol — the API key / OIDC token never reaches
the client. `expiresAfterSeconds` is forwarded to the mint endpoint and the
returned `expiresAt` is surfaced on the result.

The server-environment guard moves from realtime model construction to minting:
the browser can now build the realtime event codec it needs to drive the
transport, while minting (which requires the Gateway credential) stays
server-side.
