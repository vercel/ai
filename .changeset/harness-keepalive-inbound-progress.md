---
'@ai-sdk/harness': patch
---

fix(harness): do not mistake a slow inbound transfer for a dead sandbox bridge; stop reconnecting when heartbeat timeouts keep replaying the same event without progress, and fail with a clear error when an event exceeds the receiver's message size limit
