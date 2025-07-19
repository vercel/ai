---
'ai': patch
---

feat: automatically respect rate limit headers in retry logic

Added automatic support for respecting rate limit headers (`retry-after-ms` and `retry-after`) in the SDK's retry logic. When these headers are present and contain reasonable values (0-60 seconds), the retry mechanism will use the server-specified delay instead of exponential backoff. This matches the behavior of Anthropic and OpenAI client SDKs and improves rate limit handling without requiring any API changes.
