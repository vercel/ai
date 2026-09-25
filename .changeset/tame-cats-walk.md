---
'ai': patch
'@ai-sdk/provider-utils': patch
---

Preserve original opaque URI strings in tagged file URLs during prompt conversion. Match explicit supported URL MIME types exactly so unsupported subtypes are not forwarded to providers.
