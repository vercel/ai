---
'@ai-sdk/openai': patch
---

Fix streaming transcription over header-capable WebSocket implementations: the realtime WebSocket handshake sent the api key in both the `openai-insecure-api-key` subprotocol and the `Authorization` header, which OpenAI rejects ("You must only send one of protocol api key and Authorization header"). The Authorization header is now stripped when the subprotocol carries the key.
