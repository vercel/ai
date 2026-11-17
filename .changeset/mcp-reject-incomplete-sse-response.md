---
'@ai-sdk/mcp': patch
---

Reject pending HTTP MCP requests when their SSE response stream closes or disconnects before delivering the matching JSON-RPC response, preventing tool calls from hanging indefinitely.
