---
'@ai-sdk/camb': patch
---

Add CAMB AI provider with speech (TTS) support.

- Speech model (`camb.speech()`) using CAMB's `/tts-stream` endpoint with `SpeechModelV3`
- Supports `mars-pro`, `mars-flash`, `coqui`, `elevenlabs` speech model IDs
- Auth via `x-api-key` header with `CAMB_API_KEY` environment variable
