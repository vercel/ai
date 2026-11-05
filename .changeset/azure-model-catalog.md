---
'@ai-sdk/azure': patch
'@ai-sdk/openai': patch
---

Refactor Azure model ID logic into a model catalog that declares capabilities and provider options, and generate provider capability documentation from it. Export the OpenAI catalog internally for Azure to reuse. Request behavior is unchanged.
