---
'@ai-sdk/openai': patch
---

Implements `logprobs` for OpenAI `providerOptions` and `providerMetaData` in `OpenAIResponsesLanguageModel`

You can now set `providerOptions.openai.logprobs` when using `generateText()` and retrieve logprobs from the response via `result.providerMetadata?.openai`
