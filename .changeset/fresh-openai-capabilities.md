---
'@ai-sdk/openai': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/google': patch
'@ai-sdk/provider-utils': patch
---

Export `openaiModelCapabilities(modelId)`, `anthropicModelCapabilities(modelId)`, and `googleModelCapabilities(modelId)` to inspect bundled model capabilities and provider-option support for every declared endpoint. Share endpoint assembly, support declarations, and detached public results through provider utilities.
