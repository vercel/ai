---
'@ai-sdk/openai': patch
---

fix(openai): allow missing usage in response.completed/incomplete streaming chunks

OpenAI-compatible endpoints may send a final `response.completed` or `response.incomplete` chunk without a usage object. The streaming chunk schema previously required `usage.input_tokens` and `usage.output_tokens`, causing a TypeValidationError that rejected the chunk and left `result.usage` unhandled. `usage` is now nullish, matching the `response.failed` chunk schema and the non-streaming response schema.
