---
'@ai-sdk/amazon-bedrock': patch
---

Return `request: { body }` from `doGenerate()` and `doStream()` in the Bedrock chat language model, matching the pattern used by other providers (e.g. `@ai-sdk/anthropic`). This enables observability frameworks to access the request body for tracing and debugging.
