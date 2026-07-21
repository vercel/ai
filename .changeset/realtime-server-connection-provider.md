---
'@ai-sdk/provider': patch
---

feat (provider): add server-side realtime extensions to the experimental RealtimeModelV4 spec

Adds an optional `getServerConnection()` method and a normalized `usage` field so a trusted server/proxy can drive realtime providers the way it drives HTTP language models:

- `getServerConnection({ intent? })` returns the upstream WebSocket `{ url, headers, protocols? }` for a server-initiated connection (header auth with the long-lived credential). Providers fail fast for unsupported endpoint intents instead of silently falling back. It is the server-side sibling of the browser-only `getWebSocketConfig`.
- `serializeClientEvent` and `buildSessionConfig` now accept the same optional `intent` so server-side callers can keep endpoint selection and session serialization aligned.
- New `RealtimeModelV4Usage` type and optional `usage` on the `response-done` and `input-transcription-completed` server events. Counts are gross (cache-inclusive) with cached portions reported separately so consumers can apply their own billing split without re-parsing `raw`.
- New `RealtimeModelV4ServerConnection` and `RealtimeModelV4SessionIntent` types, exported with the `Experimental_` prefix.
