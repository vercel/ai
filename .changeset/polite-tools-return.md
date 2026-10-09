---
'ai': patch
---

Preserve the step and content position of provider-executed tool results when saving and replaying UI messages. This keeps deferred results in their original position so replay can reuse the cached prompt prefix.
