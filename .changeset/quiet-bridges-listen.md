---
'@ai-sdk/harness-claude-code': patch
---

fix(harness-claude-code): fix bridge WebSocket startup so an immediate `bridge-hello` frame cannot be missed before the listener is attached
