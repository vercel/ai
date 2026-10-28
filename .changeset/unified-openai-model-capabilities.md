---
'@ai-sdk/provider': patch
'@ai-sdk/openai': patch
'@ai-sdk/anthropic': patch
---

Introduce a model entry contract with named capability sections and request configuration. Consolidate the OpenAI and Anthropic model catalogs so existing request behavior and generated capability documentation use the same source of truth.
