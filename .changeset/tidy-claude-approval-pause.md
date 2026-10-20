---
'@ai-sdk/harness': patch
---

Fix turns hanging when a built-in tool approval and a host tool call share an assistant message. Pause for the approval without waiting for runtime echoes of completed host tools, preserving their results across continuation without executing them again.
