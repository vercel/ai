---
'@ai-sdk/deepgram': patch
---

Add Deepgram Flux support: Flux speech-to-text (`flux-general-en`, `flux-general-multi`) with `experimental_streamTranscribe` over the turn-based `/v2/listen` WebSocket, and Flux text-to-speech (the `flux` voice family) with `generateSpeech` and `experimental_streamSpeech` over `/v2/speak`. Flux transcription models now reject non-streaming `transcribe` calls with a clear error instead of failing upstream.
