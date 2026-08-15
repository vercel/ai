---
"@ai-sdk/deepgram": patch
---

feat(deepgram): pass speech `speed` option through to Deepgram

Deepgram's REST TTS API now supports a `speed` query parameter, so the
`generateSpeech` `speed` option is mapped to it instead of being ignored
with an "unsupported" warning. Deepgram does not support speed for all
languages and validates values upstream.
