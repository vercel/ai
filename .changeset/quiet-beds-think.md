---
'@ai-sdk/amazon-bedrock': patch
---

Fix disabled Anthropic thinking in Converse requests by forwarding `reasoningConfig: { type: 'disabled' }` for supported models and omitting the field for Claude 3.5 and earlier. Apply model-specific thinking fallbacks and effort limits with warnings, preserving explicit reasoning effort.
