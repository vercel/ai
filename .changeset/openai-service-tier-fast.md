---
'@ai-sdk/openai': patch
---

Accept `serviceTier: 'fast'` on OpenAI chat and responses models. OpenAI renamed priority processing to Fast mode and accepts `service_tier: 'fast'` and `'priority'` interchangeably, so `'fast'` is now passed through verbatim and gated on the same model capability as `'priority'`.
