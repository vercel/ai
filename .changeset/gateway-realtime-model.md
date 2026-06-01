---
'@ai-sdk/gateway': patch
---

feat(gateway): add experimental realtime model support

Adds `gateway.experimental_realtime()` for bidirectional audio/text realtime
sessions routed through the AI Gateway. Like every other Gateway modality, the
client speaks the normalized AI SDK realtime protocol and the Gateway
translates to/from the upstream provider server-side, so `GatewayRealtimeModel`
is a thin identity codec. Because the browser `WebSocket` API cannot set
request headers, the Gateway auth token is carried via the
`Sec-WebSocket-Protocol` subprotocol (the same workaround used for OpenAI) and
the model id rides the `?model=` query.
