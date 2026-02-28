---
'@ai-sdk/openai': patch
---

fix(openai): handle `response.failed` and `error` events in Responses API streaming

Previously, when the OpenAI Responses API returned a `response.failed` event (e.g., due to rate limiting or quota exhaustion), the event was silently ignored and `finishReason` defaulted to `'other'`. Similarly, `error` type events were forwarded but did not update `finishReason`.

This fix:
- Adds handling for `response.failed` stream events, setting `finishReason` to `'error'` and extracting the error message
- Updates the `error` event handler to also set `finishReason` to `'error'` with the error code
- Adds `response.failed` to the chunk schema validation
