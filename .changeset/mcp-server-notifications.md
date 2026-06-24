---
"@ai-sdk/mcp": patch
---

fix(mcp): handle server-initiated notifications instead of erroring

The MCP client now accepts inbound JSON-RPC notifications (a message with a `method` but no `id`) instead of surfacing them as an `Unsupported message type` error. Per the MCP specification, clients must accept server-initiated notifications (such as `notifications/message`) and silently ignore any they do not handle.
