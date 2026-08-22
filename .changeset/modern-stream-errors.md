---
'ai': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/groq': patch
'@ai-sdk/moonshotai': patch
'@ai-sdk/openai': patch
'@ai-sdk/provider-utils': patch
'@ai-sdk/xai': patch
---

feat: normalize mid-stream provider error events into public StreamProviderError instances and preserve provider-owned status, retry, and raw payload metadata
