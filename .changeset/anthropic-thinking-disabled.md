---
'@ai-sdk/anthropic': patch
---

fix(anthropic): forward `thinking: { type: 'disabled' }` to the API instead of stripping it

Previously, setting `providerOptions.anthropic.thinking = { type: 'disabled' }` was accepted by the schema but silently dropped from the outgoing request. For models that default thinking on (e.g. Sonnet 5), this left thinking enabled and could consume a small `max_tokens` budget entirely. The `disabled` value is now sent to the Anthropic Messages API.
