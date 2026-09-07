---
'@ai-sdk/anthropic': patch
'@ai-sdk/minimax': patch
---

Add `serviceTier` provider option, sent as `service_tier` in the request body. Anthropic accepts `'auto'` and `'standard_only'`; MiniMax's Anthropic-compatible endpoint accepts `'standard'` and `'priority'` (priority admission at 1.5x the standard price), usable via `providerOptions.minimax.serviceTier`.
