---
'@ai-sdk/xai': patch
---

feat(xai): speech timestamps, pronunciation replacements, provider metadata, and error parsing

- Add `withTimestamps` and `replace` provider options for text to speech. With
  `withTimestamps`, the JSON envelope is decoded and the audio returned as
  usual, while duration, content type, and character-level alignment are
  exposed via `providerMetadata.xai`.
- Return `providerMetadata.xai.traceId` (from the `x-trace-id` response
  header) on every speech response.
- Parse the text to speech error shape (`{"error":"..."}`) so `APICallError`
  messages carry xAI's real error detail instead of the HTTP reason phrase.
