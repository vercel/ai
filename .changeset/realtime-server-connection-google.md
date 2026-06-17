---
'@ai-sdk/google': patch
---

feat (provider/google): implement server-side realtime extensions

`GoogleRealtimeModel` now implements `getServerConnection()`, returning the unconstrained Gemini Live Bidi WebSocket URL with `x-goog-api-key` header auth — a trusted server holds the API key and sends the session `setup` over the socket (no ephemeral-token mint required). Unsupported endpoint intents are rejected. The event mapper now populates normalized `usage` on `response-done` from `usageMetadata`, mapping per-modality token details (audio/text), buffering standalone usage frames, and falling back to aggregate counts when details are absent.
