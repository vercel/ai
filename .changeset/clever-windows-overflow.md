---
'@ai-sdk/provider': patch
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/google': patch
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/gateway': patch
---

feat: add `isContextLengthExceeded` to `APICallError` and `GatewayError` so callers can detect when a provider rejects a prompt for exceeding the model's context window
