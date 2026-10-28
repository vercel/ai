---
'@ai-sdk/harness': patch
---

Fix turns hanging when a built-in tool approval and a host tool call share an assistant message. Pause for the approval without waiting for runtime echoes of completed host tools, preserving their results and original call metadata across consecutive approval pauses and session resumes until the runtime echo arrives, without executing them again or emitting duplicate results.
