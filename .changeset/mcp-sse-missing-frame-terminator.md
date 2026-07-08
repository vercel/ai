---
'@ai-sdk/mcp': patch
---

Fix `createMCPClient` hanging when an MCP server returns an SSE response that omits the blank-line frame terminator (`\n\n`) and keeps the connection open. The HTTP and SSE transports now dispatch an SSE event as soon as its `data:` payload forms complete JSON, and also process a trailing frame when the stream closes without a final newline.
