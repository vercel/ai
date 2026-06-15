---
'@ai-sdk/xai': patch
---

feat (provider/xai): implement server-side realtime extensions

`XaiRealtimeModel` now implements `getServerConnection()`, returning the upstream voice realtime WebSocket URL (with the `model` query param) plus header auth derived from the model's configured credentials. The event mapper now populates normalized `usage` on `response-done` and `input-transcription-completed` using xAI's OpenAI-compatible realtime wire shape.
