---
'@ai-sdk/anthropic': patch
'@ai-sdk/provider': patch
'@ai-sdk/mistral': patch
'@ai-sdk/openai': patch
'ai': patch
---

ai/core: change setting ranges for experimental temperature, presencePenalty, frequencyPenalty to match OpenAI configuration (breaking change). If you use these settings, you need to update the provider packages and adjust your values.
