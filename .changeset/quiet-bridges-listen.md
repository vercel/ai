---
'@ai-sdk/harness-claude-code': patch
---

Fix Claude Code bridge WebSocket startup so an immediate `bridge-hello` frame cannot be missed before the listener is attached.
