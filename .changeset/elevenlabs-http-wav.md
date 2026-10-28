---
'@ai-sdk/elevenlabs': patch
---

fix(elevenlabs): map the generic HTTP speech output format `wav` to the native `wav_44100` format instead of forwarding an unsupported value.
