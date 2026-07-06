---
'@ai-sdk/mcp': patch
---

Surface MCP tool annotation hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) on the tool's `metadata.annotations`. These propagate to `toolCall.toolMetadata`, enabling approval-gating via `toolApproval` (e.g. requiring confirmation for destructive tools). Adds `isMCPToolCall` and `getMCPToolAnnotations` helpers to detect MCP tool calls and read their typed hints without casting. Closes #6732.
