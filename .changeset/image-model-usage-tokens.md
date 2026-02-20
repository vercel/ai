---
'@ai-sdk/openai': patch
---

Add inputTokens and outputTokens to per-image provider metadata for image generation models. This enables downstream consumers like AI Gateway to compute token-based costs for gpt-image-1 on the v2 specification path.
