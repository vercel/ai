---
'@ai-sdk/gateway': patch
---

Add `createGateway({ regionalHosting: 'au' | 'eu' | 'us' })` to select an instance-wide regional Gateway endpoint. Language model generate and stream calls can override that default with the scalar `providerOptions.gateway.regionalHosting`, including `generateText` and `streamText` calls that use a model string with the default Gateway provider.

The client consumes the per-call option without forwarding it to the Gateway. Regional hosting does not restrict inference location or guarantee data residency, and existing `inferenceRegion` options are forwarded unchanged. Explicit `baseURL` settings conflict with constructor and per-call regional hosting, even for standard Gateway URLs, and are rejected before Gateway requests. Other Gateway surfaces reject the per-call option.
