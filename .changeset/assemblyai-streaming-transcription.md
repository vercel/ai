---
'@ai-sdk/assemblyai': patch
---

feat(assemblyai): add streaming transcription with the AssemblyAI-STT-3.7-Realtime models

`assemblyai.transcription()` now supports `experimental_streamTranscribe` with `assemblyai-stt-3-7-realtime-agent` (voice agents), `assemblyai-stt-3-7-realtime` (notetakers and live captions), and `universal-3-6-pro`. Streaming authenticates with a temporary token, so it works with the native `WebSocket` in every runtime; a custom implementation can be passed with the new `webSocket` provider setting. Streaming options such as turn detection, `agentContext`, and Voice Focus are set in `providerOptions.assemblyai.streaming`. Errors from AssemblyAI's temporary token API now surface their message.
