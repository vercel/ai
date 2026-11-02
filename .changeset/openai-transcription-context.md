---
'@ai-sdk/openai': patch
---

Forward `languages` and `keywords` transcription hints as repeated multipart fields instead of silently dropping them. Warn when these REST-only options are supplied to streaming transcription.
