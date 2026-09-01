---
'@ai-sdk/openai': patch
---

Accept `serviceTier: 'ultrafast'` on OpenAI chat and responses models. OpenAI's Ultrafast tier (currently `gpt-5.6-sol`) is a separate access-controlled service tier, so `'ultrafast'` is passed through as `service_tier: 'ultrafast'` and is not gated on priority processing.
