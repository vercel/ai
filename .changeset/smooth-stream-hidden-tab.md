---
'ai': patch
---

fix(ai): skip `smoothStream` delays while the document is hidden, so background-tab timer throttling no longer stalls the stream and any tool loop gated on its consumption
