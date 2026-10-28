---
'@ai-sdk/harness': patch
---

Fix completed host tool results being silently lost when a WebSocket enters CLOSING before the channel detects the disconnect. Queue sends until an OPEN connection is available and retain unsent frames if a reconnect flush is interrupted, so results reach the existing bridge turn without repeating host tool execution.
