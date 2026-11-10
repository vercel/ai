---
'ai': patch
---

Cancel pending queued send-now operations when a later stop or dispose occurs, preventing an abandoned chat from resuming its queue through a replacement transport.
