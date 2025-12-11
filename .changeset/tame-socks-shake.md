---
'@ai-sdk/openai': patch
---

Switch Azure Responses to providerOptions.azure

- Make OpenAI `providerOptions` compatible with other provider names.
- **Breaking:** For @ai-sdk/azure `Responses API`, `providerOptions` must use the `azure` key instead of `openai`.
