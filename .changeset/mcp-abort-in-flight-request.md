---
'@ai-sdk/mcp': patch
---

Fix `callTool` (and other MCP requests) hanging forever when the abort signal fires after the JSON-RPC request has been sent but before the server responds. The request now attaches an `abort` listener that rejects the pending promise with an `MCPClientError` and removes the response handler, preventing the leak that previously accumulated in `responseHandlers`.
