---
'@ai-sdk/elevenlabs': patch
---

feat(elevenlabs): multi-context and text-to-dialogue streaming

`doStream()` supports `providerOptions.elevenlabs.streaming.contextId` (multi-context TTS WebSocket) and `providerOptions.elevenlabs.dialogue` (Text-to-Dialogue WebSocket for `eleven_v3` / `eleven_v4`) with inline `[[voice:<id>]]` speaker markers. Exports `ElevenLabsDialogueMarkerParser`.
