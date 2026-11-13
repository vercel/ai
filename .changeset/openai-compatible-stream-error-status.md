---
'@ai-sdk/openai-compatible': patch
---

Classify streamed error frames by their `code` and `type`, so transient failures such as `server_is_overloaded` are marked retryable and `insufficient_quota` stays non-retryable.
