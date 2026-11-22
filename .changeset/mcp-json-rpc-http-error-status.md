---
'@ai-sdk/mcp': patch
---

fix(mcp): keep the HTTP status, URL, and response body on `MCPClientError` when a failed HTTP response contains a JSON-RPC error body
