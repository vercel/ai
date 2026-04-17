---
"@ai-sdk/mcp": patch
---

fix(mcp): use negotiated protocol version in mcp-protocol-version header after initialization

The `HttpMCPTransport` and `SseMCPTransport` always sent the client's `LATEST_PROTOCOL_VERSION` in the `mcp-protocol-version` header, even after the server negotiated a lower version during `initialize`. This caused post-initialization requests (like `notifications/initialized`) to be rejected with HTTP 400 by servers that only support older protocol versions (e.g. Figma Dev Mode MCP Server which supports up to `2025-06-18`).

The transport now stores the negotiated `protocolVersion` from the server's initialize response and uses it in all subsequent request headers, falling back to `LATEST_PROTOCOL_VERSION` before initialization completes.
