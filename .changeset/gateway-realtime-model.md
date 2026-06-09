---
'@ai-sdk/gateway': patch
---

feat(gateway): add experimental realtime model support

Adds `gateway.experimental_realtime()` for bidirectional audio/text realtime
sessions routed through the AI Gateway. Like every other Gateway modality, the
client speaks the normalized AI SDK realtime protocol and the Gateway
translates to/from the upstream provider server-side, so `GatewayRealtimeModel`
is a thin identity codec. Gateway realtime is server-side only for v0 and throws
if used in a browser because it returns the resolved Gateway auth token rather
than a minted ephemeral client secret. Because the browser `WebSocket` API
cannot set request headers, the Gateway auth token is carried via the
`Sec-WebSocket-Protocol` subprotocol (the same workaround used for OpenAI) and
the model id rides the `?ai-model-id=` query — the WS transport of the
`ai-model-id` header used by the HTTP routes. The model id is passed through
verbatim; the Gateway owns resolution. Provider options (including BYOK) flow
through the normalized `session.update`, exactly as they ride the request body
on the non-realtime routes.

The versioned subprotocol auth contract is centralized so the client and the
Gateway server share one definition: `getGatewayRealtimeProtocols` (client
encode) and `getGatewayRealtimeAuthToken` (server decode), plus the
`GATEWAY_REALTIME_SUBPROTOCOL` / `GATEWAY_AUTH_SUBPROTOCOL_PREFIX` constants.

`GatewayProviderOptions` documents the stable client-facing option fields while
remaining open to service-owned options. Runtime validation lives in the Gateway
service so the server can evolve without requiring an SDK release for every new
option.
