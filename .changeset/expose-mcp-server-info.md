---
'@ai-sdk/mcp': patch
---

feat(ai/mcp): expose `serverInfo` from MCP initialize handshake

`MCPClient` now exposes the server's `serverInfo` (containing `name`, `version`, and optional `title`) as a readonly property. Previously, this was parsed during initialization but discarded.
