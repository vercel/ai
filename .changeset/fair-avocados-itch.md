---
'@ai-sdk/provider-utils': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/provider': patch
'@ai-sdk/mistral': patch
'@ai-sdk/openai': patch
'ai': patch
---

ai/core: remove scaling of setting values (breaking change). If you were using the temperature, frequency penalty, or presence penalty settings, you need to update the providers and adjust the setting values.
