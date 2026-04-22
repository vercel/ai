---
'@ai-sdk/google': patch
---

fix: strip cross-provider thoughtSignature during gateway failover

Prevents Vertex-origin thought signatures from being passed to Google AI Studio
(and vice versa) when the AI Gateway fails over between providers. Fixes #13055
and #14196.
