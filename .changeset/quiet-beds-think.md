---
'@ai-sdk/amazon-bedrock': patch
---

Forward disabled thinking in Anthropic Converse requests when using `reasoning: 'none'` or `reasoningConfig: { type: 'disabled' }`. Apply model-specific fallbacks and effort limits when disabled thinking is unsupported, preserving explicit reasoning effort during the adaptive fallback.
