---
'@ai-sdk/mcp': patch
---

Fix `createMCPClient` hanging when an MCP server using the HTTP transport returns an SSE response that omits the blank-line frame terminator (`\n\n`) and keeps the connection open. The HTTP transport now dispatches an SSE event as soon as its `data:` payload forms complete JSON, and also processes a trailing frame when the stream closes without a final newline.
