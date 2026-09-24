---
'@ai-sdk/openai': patch
---

The OpenAI Responses provider now accepts `providerOptions.openai.reasoningEffortUpdate` on empty system messages and sends each update at its position in the conversation. This lets applications change reasoning effort during a conversation while preserving the prompt prefix for caching.
