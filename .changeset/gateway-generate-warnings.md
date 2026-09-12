---
'@ai-sdk/gateway': patch
---

fix(gateway): forward server-returned warnings on language model doGenerate

`generateText(...).warnings` through the gateway provider was always an empty
array: `doGenerate` spread the gateway response body and then overwrote the
server's `warnings` with a locally constructed empty array. The warnings the
gateway relays from the upstream provider (and gateway-originated warnings)
are now forwarded, matching the streaming path and every other modality.
