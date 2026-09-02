---
'@ai-sdk/openai': patch
'@ai-sdk/azure': patch
---

Accept `serviceTier: 'ultrafast'` on OpenAI chat and responses models. OpenAI published Ultrafast as `service_tier: 'ultrafast'` (currently `gpt-5.6-sol`) in the official Responses API reference and in openai-node `ServiceTier` since v7.5.0. It is a separate access-controlled tier, so `'ultrafast'` is passed through as `service_tier: 'ultrafast'` and is not gated on priority processing. `@ai-sdk/azure` re-exports the same option type and will forward the value; Azure OpenAI does not document this tier.
