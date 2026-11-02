---
'@ai-sdk/google': patch
---

Map Google RPC status names to HTTP status codes when streamed errors omit a numeric code, so transient failures such as `UNAVAILABLE` and `RESOURCE_EXHAUSTED` are marked retryable.
