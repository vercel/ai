---
'@ai-sdk/mcp': patch
---

Reject HTTP transport redirects by default to prevent MCP servers from redirecting requests to unintended hosts or private networks. GET, POST, and DELETE requests now use `redirect: 'error'`; explicitly configured private endpoints remain supported. Redirect following remains available through `redirect: 'follow'` for trusted destinations.
