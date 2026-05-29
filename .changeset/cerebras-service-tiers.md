---
'@ai-sdk/cerebras': patch
---

feat(provider/cerebras): add `serviceTier` and `queueThreshold` provider options. `serviceTier` is sent as `service_tier` in the request body, `queueThreshold` as the `queue_threshold` header, and the effective tier returned by the API is exposed on `providerMetadata.cerebras.serviceTier`.
