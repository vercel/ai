---
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/google': patch
'@ai-sdk/amazon-bedrock': patch
---

Add `resolveProviderOptions` to parse provider options that a model accepts under several `providerOptions` keys, either as aliases (`first`) or merged in order (`merge`), and use it for the existing multi-key lookups in the OpenAI, OpenAI-compatible, Anthropic, Google, and Amazon Bedrock models. Resolution behavior for these models is unchanged.
