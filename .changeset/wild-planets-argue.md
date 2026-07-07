---
'@ai-sdk/xai': patch
---

fix: omit the reasoning effort parameter and emit an unsupported warning when the top-level `reasoning` option is used with xAI models that reject it (`grok-4.20-reasoning`, `grok-4.20-non-reasoning`, and dated variants)
