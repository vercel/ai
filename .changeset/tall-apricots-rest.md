---
'@ai-sdk/mcp': patch
---

Fix MCP HTTP transports so they omit the `MCP-Protocol-Version` header before initialization negotiation completes, then reuse the server-negotiated version on subsequent requests.
