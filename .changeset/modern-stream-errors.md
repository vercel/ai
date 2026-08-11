---
'ai': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/moonshotai': patch
'@ai-sdk/provider-utils': patch
---

feat: normalize mid-stream provider error events into public StreamProviderError instances and preserve provider-owned status, retry, and raw payload metadata
