---
'@ai-sdk/elevenlabs': patch
---

feat(elevenlabs): text-to-dialogue streaming

`doStream()` supports `providerOptions.elevenlabs.dialogue` (Text-to-Dialogue WebSocket for `eleven_v3` / `eleven_v4`). Each text part's `voice` (default: the call's `voice`, else the first dialogue voice) selects its speaker and must be listed in `dialogue.voices`; a voice change starts a new turn, and `providerOptions.elevenlabs.newTurn` on a part forces one. Options Text-to-Dialogue does not support produce warnings.
