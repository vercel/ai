---
"@ai-sdk/deepgram": patch
---

feat(deepgram): expose Deepgram speech response headers in providerMetadata

`providerMetadata.deepgram` now carries `modelName` (the resolved upstream
model), `modelUuid`, `additionalModelUuids`, `charCount` (the billed
character count), `breaksApplied`, `pronunciationsApplied`,
`pronunciationWarnings` (when present), and `requestId` from the
`/v1/speak` response headers.
