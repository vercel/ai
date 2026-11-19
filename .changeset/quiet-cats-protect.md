---
'@ai-sdk/devtools': patch
---

Restrict the DevTools storage directory and database to owner-only permissions, including existing storage, before writing potentially sensitive prompts and responses.

Reject symlinked, hard-linked, unowned, or unsafe shared storage before changing permissions or writing, and verify the opened database before updating it through the same file handle.
