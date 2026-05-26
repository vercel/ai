---
'@ai-sdk/mcp': patch
---

feat(mcp): expose `statusCode`, `url`, and `responseBody` on `MCPClientError` for HTTP transport failures

`MCPClientError` now carries structured HTTP context when it originates from the
streamable HTTP transport. This lets downstream consumers (e.g. agent frameworks
that need to decide whether to fall back from streamable HTTP to legacy SSE
transport per the MCP spec) branch on the actual response status without parsing
the error message string.

Fields are optional — they remain `undefined` for stdio transport errors and for
non-response failures (network errors, aborts).
