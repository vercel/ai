---
'@ai-sdk/openai-compatible': patch
---

fix(openai-compatible): mark in-stream overloaded, rate limit, timeout, and server error frames as retryable based on their `type` and `code`
