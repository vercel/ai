---
'ai': patch
---

Fix `ToolLoopAgent` `onFinish` callbacks on the v6 release line so per-call `onFinish` is accepted again and merged with the constructor-level callback for `generate()` and `stream()`.
