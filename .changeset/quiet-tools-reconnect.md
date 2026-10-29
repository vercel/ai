---
'@ai-sdk/harness': patch
---

fix(harness): fix completed host tool results being silently lost when a WebSocket enters CLOSING before the channel detects the disconnect
