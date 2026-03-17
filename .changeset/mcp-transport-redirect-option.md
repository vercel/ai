---
'@ai-sdk/mcp': patch
---

feat(mcp): add `redirect` option to `MCPTransportConfig` for controlling HTTP redirect behavior

Added a `redirect` option to `MCPTransportConfig` that is passed through to all `fetch()` calls in both SSE and HTTP transports. Set `redirect: 'error'` to reject redirect responses, preventing servers from redirecting requests to unintended hosts. Defaults to `'follow'` for backward compatibility.
