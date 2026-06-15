---
'@ai-sdk/openai': patch
---

feat (provider/openai): implement server-side realtime extensions

`OpenAIRealtimeModel` now implements `getServerConnection()`, returning the upstream realtime WebSocket URL (per `intent`: `conversation` / `transcription` / `translation`) plus header auth derived from the model's configured credentials. The event mapper now populates normalized `usage` on `response-done` and `input-transcription-completed` (gross input/output token counts with cached portions reported separately; duration usage for duration-billed transcription).
