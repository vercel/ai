---
'ai': patch
---

Use the new `fetchUntrustedUrl` helper for SDK downloads, preserving the existing
user-agent header and URL validation while enforcing first-hop credential isolation.
