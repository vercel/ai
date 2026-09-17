---
'@ai-sdk/react': patch
---

fix(react): reconnect and resume stream on visibilitychange

When `resume: true` is enabled in `useChat`, switching browser tabs or backgrounding
the application can drop the active stream. A `visibilitychange` listener is now attached
when `resume: true` to call `resumeStream()` when returning to a visible tab.
