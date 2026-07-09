---
'@ai-sdk/gateway': patch
'ai': patch
---

feat(gateway): support experimental streaming transcription. `GatewayTranscriptionModel` now implements `doStream`, so `experimental_streamTranscribe` works through the AI Gateway (e.g. `gateway.transcription('openai/gpt-realtime-whisper')` or the `'openai/gpt-realtime-whisper'` string model ID). The gateway buffers the audio stream and streams the transcript back over SSE.
