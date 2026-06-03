---
"@ai-sdk/mcp": patch
---

Add `resource_link` content type to `CallToolResultSchema` and `PromptMessageSchema` per MCP spec. Fixes hard rejection when MCP servers return `resource_link` content parts with zod ≥ 4.4.x.
