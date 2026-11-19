---
'@ai-sdk/mcp': patch
---

Keep only the origin of the server URL on `MCPClientError.url` from the HTTP and SSE transports. A server URL can carry a token in its path or query, and errors are often logged.
