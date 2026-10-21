---
'@ai-sdk/elevenlabs': patch
---

feat(elevenlabs): text-to-dialogue streaming

`doStream()` supports `providerOptions.elevenlabs.dialogue` (Text-to-Dialogue WebSocket for `eleven_v3` / `eleven_v4`) with inline `[[voice:<id>]]` speaker markers.
