---
'@ai-sdk/provider-utils': patch
'@ai-sdk/mcp': patch
---

feat(mcp): preserve MCP tool annotations including readOnlyHint

Preserve all MCP tool annotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) when converting MCP tools to AI SDK tools. These annotations are informational hints that enable clients to make informed decisions about tool behavior.
