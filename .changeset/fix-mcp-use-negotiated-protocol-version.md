---
'@ai-sdk/mcp': patch
---

Use the server-negotiated protocol version in the `mcp-protocol-version` header for all subsequent requests — previously the SDK always sent `LATEST_PROTOCOL_VERSION`, causing handshake mismatches with servers that negotiate an older version (e.g. Figma MCP).
