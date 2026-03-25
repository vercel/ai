---
'@ai-sdk/mcp': patch
---

fix(mcp): expose server instructions on MCP client

`MCPClient` now exposes `serverInstructions` in addition to `serverCapabilities`, so both initialization fields can be accessed directly from the client instance.
