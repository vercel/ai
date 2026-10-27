---
'@ai-sdk/openai': patch
---

Fix `gpt-transcribe` REST transcription. Requests with OpenAI provider options now use `response_format: 'json'`, since the model rejects `verbose_json`. `durationInSeconds` is read from `usage.seconds` when a duration-billed response has no top-level `duration`.
