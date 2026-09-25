---
'@ai-sdk/harness-claude-code': patch
---

fix(harness-claude-code): return the same `result` shape for an external MCP tool call whether Claude reports it alone or batched with other tool results, preferring the MCP `structuredContent` and otherwise parsing JSON text content instead of passing the raw CallToolResult content through
