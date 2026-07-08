---
"ai": patch
---

Make `Chat.stop()` wait for the aborted stream request to finish cleanup before resolving, so callers can safely clear or replace messages after stopping an active stream.
