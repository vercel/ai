---
'ai': patch
---

Fix `useChat` status briefly flashing to `submitted` on page load when `resume: true` is set and there is no active stream to resume. The `reconnectToStream` check is now performed before setting status to `submitted`, so status stays `ready` when the server responds with 204 (no active stream).
