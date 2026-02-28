---
'ai': patch
---

fix: prevent "Controller is already closed" crash in run-tools-transformation

- Added safeEnqueue/safeClose guards around all toolResultsStreamController operations
- Prevents crashes when tool execution callbacks fire after the stream has been closed due to an error
