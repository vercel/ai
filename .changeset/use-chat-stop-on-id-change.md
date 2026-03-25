---
'@ai-sdk/react': patch
---

Stop the previous chat stream when `id` changes in `useChat`. Prevents orphaned fetch requests from continuing after switching chat rooms.
