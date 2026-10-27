---
'@ai-sdk/openai': patch
---

Support streaming transcription with `gpt-live-transcribe` and `gpt-transcribe`. The `language` provider option is sent as a single-entry `languages` list for these models, and `gpt-live-transcribe` now rejects non-streaming transcription since it has no REST endpoint.
