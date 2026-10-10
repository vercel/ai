---
'ai': patch
---

Preserve the arrival position of provider-executed tool results when saving and replaying UI messages. This keeps deferred results in their original position so replay can reuse the cached prompt prefix.

Exclude preliminary provider-executed outputs from model-message conversion until a final result is available.
