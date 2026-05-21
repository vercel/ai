---
"@ai-sdk/amazon-bedrock": patch
---

Accept `citation` deltas in the Converse stream schema so that streaming with `providerOptions.bedrock.citations.enabled = true` no longer fails with `AI_TypeValidationError`. The citation payload is currently passed through without being surfaced; this only fixes the validation crash.
