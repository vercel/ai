---
'@ai-sdk/openai': patch
---

fix(openai): handle `response.failed` stream event and set `finishReason` to `error` for Responses API errors

Previously, when the OpenAI Responses API returned an `error` event or a
`response.failed` event (e.g. on rate-limit exceeded), the stream would
complete with `finishReason: "other"` and the `response.failed` chunk was
silently ignored (treated as an unknown chunk). This made it impossible to
distinguish a successful response from a failed one.

- Added `response.failed` to the chunk schema
- Handle `response.failed` chunks in the stream processor: enqueue an error
  event and set `finishReason` to `"error"`
- When an `error` chunk is received, also set `finishReason` to `"error"`

Fixes #6534
