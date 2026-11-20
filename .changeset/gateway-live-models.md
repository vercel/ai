---
'@ai-sdk/gateway': patch
'ai': patch
---

feat(gateway): support Live models over WebSocket

- `gateway.experimental_realtime()` returns a continuous Live model for `openai/gpt-live-1` and `openai/gpt-live-1.1`. It connects to the Gateway Live route and speaks the normalized Live protocol (`session-start`, PCM16 audio, `context-append`, `session-close` with final usage). Pass `{ api: 'live' }` for other Live model IDs or `{ api: 'realtime' }` to force the realtime route. Before, these model IDs opened the realtime route, which rejected them with `invalid_model`.
- `gateway.experimental_realtime.getToken()` mints Live-bound client secrets for Live models.
- `experimental_useRealtime` and the realtime session can connect a continuous model straight to the provider with a short-lived token (`api.token`) when the model explicitly declares the `client-secret-websocket` connection. Before, continuous WebSocket sessions required an application relay.
