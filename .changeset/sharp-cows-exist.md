---
'@ai-sdk/openai': patch
---

fix(openai): preserve raw finish reason for failed responses stream events

Handle `response.failed` chunks in Responses API streaming so `finishReason.raw` is preserved from `incomplete_details.reason` (e.g. `max_output_tokens`), and map failed-without-reason cases to unified `error` instead of `other`.
