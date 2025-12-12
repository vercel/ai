---
'@ai-sdk/xai': patch
---

Add `mcpServer` tool factory for xAI Responses API Remote MCP support

- Adds `xai.tools.mcpServer()` for connecting to remote MCP servers via xAI's Responses API
- Includes streaming event schemas for MCP calls (`mcp_call`, `response.mcp_call.*` events)
- Supports all MCP configuration options: serverUrl, serverLabel, serverDescription, allowedTools, headers, authorization
