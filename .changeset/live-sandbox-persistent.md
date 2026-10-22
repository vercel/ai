---
'@ai-sdk/sandbox-vercel': patch
---

Pass `persistent` through to live sandboxes created from a template snapshot. `persistent: false` used to be dropped, so every stop of a live sandbox wrote a new snapshot.
