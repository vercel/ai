---
'@ai-sdk/mcp': patch
---

Handle MCP 2026-07-28 input-required results through the registered elicitation handler and retry the original tool, prompt, or resource request with its answers and request state.

Preserve the browser fetch receiver in MCP HTTP and SSE transports to prevent illegal-invocation errors.
