---
"@ai-sdk/openai": patch
---

fix(openai): accept `incomplete` function_call items on the Responses stream, so a call truncated by `max_output_tokens` finishes with `length` instead of a `TypeValidationError`
