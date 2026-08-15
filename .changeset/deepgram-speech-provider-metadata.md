---
"@ai-sdk/deepgram": patch
---

feat(deepgram): expose Deepgram speech response headers in providerMetadata

`providerMetadata.deepgram` now carries `modelName` (the resolved upstream
model, e.g. `aura-2-thalia-en`), `modelUuid`, `charCount` (the billed
character count), and `requestId` from the `/v1/speak` response headers.
