---
'@ai-sdk/openai': patch
---

fix(openai): read transcription duration from `usage` for duration-billed `json` responses

`durationInSeconds` now falls back to `usage.seconds` when `usage.type` is `duration` and the response has no top-level `duration` (e.g. `gpt-transcribe` with the default `json` response format).
