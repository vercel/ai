---
'@ai-sdk/openai': patch
'@ai-sdk/xai': patch
---

Strip undefined header values before the streaming transcription WebSocket constructor (header-capable implementations like `ws` throw on undefined values).
