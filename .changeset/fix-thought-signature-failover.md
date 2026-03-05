---
'@ai-sdk/google': patch
---

Fix gateway failover losing thoughtSignature when failing over from Vertex to Google AI Studio. The Google provider now falls back to checking the vertex namespace for thoughtSignature, matching the existing Vertex-to-Google fallback behavior.
