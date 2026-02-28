---
'@ai-sdk/openai': patch
---

fix(openai): properly handle stream errors in Responses API

- Wrap `error` events in `APICallError` with appropriate status codes and retryability instead of passing raw error objects
- Add `response.failed` event handling to Zod schema and stream processor
- Set `finishReason.unified` to `'error'` (was `'other'`) and `finishReason.raw` to the error code (was `undefined`) when stream errors occur
- Add helper functions `mapErrorCodeToStatusCode()` and `isRetryableErrorCode()` for consistent error mapping

Fixes #6534
