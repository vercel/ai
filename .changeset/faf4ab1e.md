---
'@ai-sdk/mcp': patch
---

fix(mcp): use negotiated protocol version in transport request headers

After a successful `initialize` handshake, `HttpMCPTransport` and `SseMCPTransport` were hardcoding `LATEST_PROTOCOL_VERSION` (2025-11-25) in every subsequent request header instead of the version actually negotiated with the server. This caused 400 errors against servers that only support older versions — notably Figma Dev Mode MCP (supports up to 2025-06-18).

The fix stores the negotiated `protocolVersion` from the `initialize` result on the transport, and both transports now fall back to `LATEST_PROTOCOL_VERSION` only when no negotiated version has been set yet.

Fixes #14413. Thanks to @stevering for the detailed report and local validation of this fix.
