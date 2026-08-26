---
'@ai-sdk/azure': patch
'@ai-sdk/openai': patch
'@ai-sdk/provider-utils': patch
'ai': patch
---

Split OpenAI and Azure OpenAI embedding requests by a conservative UTF-8 byte budget derived from their aggregate token limit, in addition to input count limits.
