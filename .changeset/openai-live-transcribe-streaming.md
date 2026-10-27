---
'@ai-sdk/openai': patch
---

Support streaming transcription with `gpt-live-transcribe` and `gpt-transcribe`. For these models the `language` provider option is sent as a single-entry `languages` list. `gpt-transcribe` warns about and omits `streaming.delay`, which it does not support. `gpt-live-transcribe` rejects non-streaming transcription, since it has no REST endpoint.
