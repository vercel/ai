---
'@ai-sdk/openai': patch
---

feat (provider/openai): implement server-side realtime extensions

`OpenAIRealtimeModel` now implements `getServerConnection()`, returning the upstream realtime WebSocket URL for `conversation` and `transcription` intents plus header auth derived from the model's configured credentials. Dedicated transcription sessions serialize with `session.type: "transcription"` and the selected realtime model id. Translation is rejected until the normalized realtime codec supports its distinct wire protocol. The event mapper now populates normalized `usage` on `response-done` and `input-transcription-completed` (gross input/output token counts with cached portions reported separately; duration usage for duration-billed transcription).
