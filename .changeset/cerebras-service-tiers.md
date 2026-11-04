---
'@ai-sdk/cerebras': patch
---

Add the `queueThreshold` provider option as a `queue_threshold` request header and expose the API-reported `service_tier` as `providerMetadata.cerebras.serviceTier` for generated and streamed responses. Missing or null response tiers remain absent. Service tiers require a preview-enabled dedicated Cerebras endpoint.
