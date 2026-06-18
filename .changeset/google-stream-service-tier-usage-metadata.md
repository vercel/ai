---
"@ai-sdk/google": patch
---

fix(google): read `serviceTier` from `usageMetadata.serviceTier` in both generate and stream paths

The previous implementation read `serviceTier` from the `x-gemini-service-tier`
response header, which is only populated on non-streaming responses. Gemini
streaming includes the value in `usageMetadata.serviceTier` on every chunk, so
`providerMetadata.google.serviceTier` was always `null` for streams. Read from
`usageMetadata` for both paths instead.
