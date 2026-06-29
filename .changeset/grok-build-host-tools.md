---
'@ai-sdk/harness-grok-build': patch
---

feat(harness-grok-build): drive the `grok agent stdio` ACP surface

Move the adapter to ACP (JSON-RPC over stdio): tool-call, tool-result, and
file-change events; token usage and a structured finish reason on finish;
host-defined custom tools via an in-sandbox MCP server; and built-in tool
approvals through the ACP `session/request_permission` flow.
