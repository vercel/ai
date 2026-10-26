---
'@ai-sdk/azure': patch
---

fix(azure): treat all Azure Speech 502s as retryable again. MAI-Voice-2.1 now rejects unknown voices and unsupported styles with a 400, so the Envoy protocol-error 502 special case is removed.
