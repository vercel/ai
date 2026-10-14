---
'@ai-sdk/provider-utils': patch
---

Fix multipart request body cancellation hanging during a pending file read by cancelling source streams before closing the multipart iterator.
