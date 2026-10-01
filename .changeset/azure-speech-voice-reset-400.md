---
'@ai-sdk/azure': patch
---

fix(azure): report the Azure Speech voice-reset 502 as a non-retryable 400. An unknown voice or unsupported style on MAI-Voice-2.1 makes Azure Speech reset the connection with an Envoy `protocol error` 502; since this is a client input error, the resulting `APICallError` now carries `statusCode: 400` so HTTP clients and gateways do not retry it as a server error.
