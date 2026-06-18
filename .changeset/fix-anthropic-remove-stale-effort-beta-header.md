---
'@ai-sdk/anthropic': patch
---

Remove stale `effort-2025-11-24` beta header — the extended thinking effort parameter is GA and no longer requires the beta flag. Vertex AI's strict validator was actively rejecting requests with this header.
