---
'ai': patch
'@ai-sdk/react': patch
---

fix: resume interrupted chat streams when the page becomes visible again

`useChat` with `resume: true` no longer starts a second resume request on mount when the chat is already submitted or streaming, e.g. when remounting with a shared `Chat` instance mid-stream.
