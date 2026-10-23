---
'@ai-sdk/mcp': patch
---

Fix MCP tool output conversion throwing on primitive or nullish results returned by output schemas or execute wrappers. Convert strings to text and normalize undefined outputs to JSON null while preserving MCP content conversion.
