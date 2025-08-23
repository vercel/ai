---
'@ai-sdk/openai': patch
---

fix(provider/ai): do not set `.providerMetadata.openai.logprobs` to an array of empty arrays when using `streamText()`
