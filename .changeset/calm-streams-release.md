---
'ai': patch
---

fix(ai): release telemetry-counted transcription audio streams after use

Streaming transcription telemetry now releases its hidden reader when the audio input ends, errors, or is cancelled, allowing callers to reuse or transfer their stream after transcription.
