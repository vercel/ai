---
'@ai-sdk/gateway': patch
---

feat (provider/gateway): implement server-side realtime connection descriptors

`GatewayRealtimeModel` now implements `getServerConnection()`, returning the AI Gateway realtime WebSocket URL plus `Authorization` header auth and optional team scoping for trusted server-side clients. Unsupported endpoint intents are rejected on the normalized realtime route.
