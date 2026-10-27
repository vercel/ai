---
'@ai-sdk/anthropic': patch
---

Support synchronous and asynchronous `authToken` providers so applications can use refreshable credentials, including Anthropic workload identity federation helpers for inference. Resolve tokens before each request while preserving existing authentication headers and beta-header behavior.
