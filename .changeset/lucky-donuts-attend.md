---
'@ai-sdk/gateway': patch
---

Add experimental streaming transcription support to the gateway provider (`GatewayTranscriptionModel.doStream`), speaking the shared transcription-stream WebSocket envelope from `@ai-sdk/provider-utils`. `experimental_streamTranscribe` now works with gateway string model IDs, e.g. `experimental_streamTranscribe({ model: 'openai/gpt-realtime-whisper', ... })`.
