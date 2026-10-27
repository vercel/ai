---
'@ai-sdk/amazon-bedrock': patch
---

Forward disabled thinking in Anthropic Converse requests when using `reasoning: 'none'` or `reasoningConfig: { type: 'disabled' }`, omitting the unsupported thinking field for Claude 3.5 and earlier. Apply model-specific fallbacks and effort limits when disabled thinking is unsupported, preserving explicit reasoning effort during the adaptive fallback.
