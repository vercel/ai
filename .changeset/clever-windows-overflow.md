---
'ai': patch
'@ai-sdk/provider': patch
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/google': patch
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/gateway': patch
'@ai-sdk/groq': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/moonshotai': patch
'@ai-sdk/xai': patch
---

feat: add `isContextLengthExceededError` and a `reason` on provider errors, so callers can detect when the input plus reserved output tokens exceed the model's context window
