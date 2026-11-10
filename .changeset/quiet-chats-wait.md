---
'ai': patch
---

Cancel pending send-now operations when a later stop or dispose occurs, preventing an abandoned chat's queued messages and history from being sent through a replacement transport.
