---
'ai': patch
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/google': patch
'@ai-sdk/groq': patch
'@ai-sdk/huggingface': patch
'@ai-sdk/moonshotai': patch
'@ai-sdk/open-responses': patch
'@ai-sdk/openai': patch
'@ai-sdk/provider-utils': patch
'@ai-sdk/xai': patch
---

feat: normalize mid-stream provider error events across supported providers into public StreamProviderError instances and preserve provider-owned type, code, status, retry, and raw payload metadata
