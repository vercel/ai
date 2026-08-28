---
'@ai-sdk/provider-utils': patch
'@ai-sdk/gateway': patch
'ai': patch
---

Mark transient network errors that occur while reading successful response bodies as retryable, including AI Gateway responses.
